import uuid
import datetime
import re
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from models import (
    FreightConfig,
    FreightRawEmail,
    FreightShipment,
    FreightShipmentIdentifier,
    FreightEmailExtraction,
    FreightEvent,
    FreightCarrierSnapshot,
    FreightAlert,
    RawEmail,
    Mailbox,
    ReviewItem
)
from neuromail.core.llm.client import LLMClient

logger = logging.getLogger("FreightService")

def parse_date_robustly(date_str: str) -> Optional[datetime.datetime]:
    if not date_str:
        return None
    date_str = date_str.strip()
    
    for fmt in [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%Y/%m/%d"
    ]:
        try:
            return datetime.datetime.strptime(date_str, fmt)
        except ValueError:
            continue
            
    try:
        cleaned = date_str.replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(cleaned)
    except Exception:
        pass
        
    return None

def make_json_serializable(data: dict) -> dict:
    res = {}
    for k, v in data.items():
        if isinstance(v, datetime.datetime):
            res[k] = v.isoformat()
        elif isinstance(v, list):
            new_list = []
            for item in v:
                if isinstance(item, dict):
                    new_list.append({ik: (iv.isoformat() if isinstance(iv, datetime.datetime) else iv) for ik, iv in item.items()})
                else:
                    new_list.append(item.isoformat() if isinstance(item, datetime.datetime) else item)
            res[k] = new_list
        elif isinstance(v, dict):
            res[k] = make_json_serializable(v)
        else:
            res[k] = v
    return res

# Pydantic schemas for LLM-based structured output parsing
class FreightIdentifierSchema(BaseModel):
    identifier_type: str  # booking_ref, container_id, po_number, bl_number, other
    identifier_value: str

class AIFreightExtractionSchema(BaseModel):
    primary_reference: Optional[str] = Field(None, description="The main shipment ID, Booking reference or Bill of Lading (B/L) number. Usually starts with BOL-")
    carrier: Optional[str] = Field(None, description="The name of the shipping line or carrier (e.g. Maersk, MSC, Hapag-Lloyd)")
    origin_port: Optional[str] = Field(None, description="The port of loading / origin port")
    destination_port: Optional[str] = Field(None, description="The port of discharge / destination port")
    eta: Optional[str] = Field(None, description="The estimated time of arrival if mentioned (formatted as ISO datetime or YYYY-MM-DD)")
    identifiers: List[FreightIdentifierSchema] = Field(default_factory=list, description="Other reference numbers like container numbers, PO numbers, booking refs")

def get_tenant_config(db: Session, tenant_id: str) -> FreightConfig:
    cfg = db.query(FreightConfig).filter(FreightConfig.tenant_id == tenant_id).first()
    if not cfg:
        # Create a default freight config for the tenant
        cfg = FreightConfig(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            subject_patterns=["shipment", "arrival", "bol", "booking"],
            from_addresses=[]
        )
        db.add(cfg)
        try:
            db.commit()
            db.refresh(cfg)
        except IntegrityError:
            db.rollback()
            cfg = db.query(FreightConfig).filter(FreightConfig.tenant_id == tenant_id).first()
    return cfg

def matches_config(email: RawEmail, cfg: FreightConfig) -> bool:
    # Check sender allowlist if not empty
    if cfg.from_addresses:
        sender_email = (email.sender or "").lower()
        match = re.search(r'<([^>]+)>', sender_email)
        if match:
            sender_email = match.group(1).strip()
        
        allowed = False
        for addr in cfg.from_addresses:
            addr_lower = addr.lower()
            if "@" in addr_lower:
                if sender_email == addr_lower:
                    allowed = True
                    break
            else:
                if sender_email.endswith(addr_lower):
                    allowed = True
                    break
        if not allowed:
            return False

    # Check subject patterns if not empty
    if cfg.subject_patterns:
        subject_lower = (email.subject or "").lower()
        matched_subject = False
        for pat in cfg.subject_patterns:
            pat_lower = pat.lower()
            if pat_lower in subject_lower:
                matched_subject = True
                break
        if not matched_subject:
            return False

    return True

def parse_freight_email(db: Session, tenant_id: str, raw_freight: FreightRawEmail) -> dict:
    text = f"{raw_freight.subject or ''}\n{raw_freight.raw_body or ''}"
    
    # 1. Regex heuristic for BOL-XXXXX
    bol_match = re.search(r'\b(BOL-[A-Za-z0-9\-]+)\b', text, re.IGNORECASE)
    primary_ref = bol_match.group(1).upper() if bol_match else None
    
    # 2. Regex heuristic for carrier
    carriers = ["MAERSK", "MSC", "HAPAG-LLOYD", "CMA CGM", "EVERGREEN", "COSCO", "ONE", "DHL", "FEDEX"]
    carrier = None
    for c in carriers:
        if re.search(r'\b' + re.escape(c) + r'\b', text, re.IGNORECASE):
            carrier = c
            break
            
    # 3. Regex heuristic for ports
    origin_match = re.search(r'(?:origin|from|loading port|pol)[:\s]+([A-Za-z\s]{3,30})', text, re.IGNORECASE)
    dest_match = re.search(r'(?:destination|to|discharge port|pod)[:\s]+([A-Za-z\s]{3,30})', text, re.IGNORECASE)
    origin_port = origin_match.group(1).strip() if origin_match else None
    dest_port = dest_match.group(1).strip() if dest_match else None
    
    # 4. Regex heuristic for ETA
    eta_match = re.search(r'(?:eta|arrival|estimated arrival)[:\s]+([0-9\-\/]{8,10}|\w+\s+\d+,\s+\d{4})', text, re.IGNORECASE)
    eta = None
    if eta_match:
        try:
            eta = parse_date_robustly(eta_match.group(1).strip())
        except Exception:
            pass
            
    extra_identifiers = []
    
    # 5. Regex heuristic for container IDs (4 letters + 7 numbers)
    container_matches = re.findall(r'\b([A-Z]{4}\d{7})\b', text)
    for container in container_matches:
        if container != primary_ref:
            extra_identifiers.append({
                "identifier_type": "container_id",
                "identifier_value": container
            })

    # 6. Fallback to LLM structured extraction if primary reference is missing
    if not primary_ref:
        try:
            client = LLMClient(db)
            prompt = (
                f"Analyze the following freight email and extract structured shipment details. "
                f"Identify a primary reference (like booking reference or bill of lading number starting with BOL- or similar). "
                f"Extract carrier, origin port, destination port, ETA, and any other tracking numbers.\n\n"
                f"Subject: {raw_freight.subject}\n"
                f"From: {raw_freight.from_address}\n"
                f"Body:\n{raw_freight.raw_body}"
            )
            
            structured_res: AIFreightExtractionSchema = client.generate(
                tenant_id=tenant_id,
                system_instruction="You are a logistics extraction specialist. Parse email contents into structured data.",
                prompt=prompt,
                schema=AIFreightExtractionSchema,
                feature_name="freight_extraction"
            )
            if structured_res:
                primary_ref = structured_res.primary_reference
                if structured_res.carrier:
                    carrier = structured_res.carrier
                if structured_res.origin_port:
                    origin_port = structured_res.origin_port
                if structured_res.destination_port:
                    dest_port = structured_res.destination_port
                if structured_res.eta:
                    try:
                        eta = parse_date_robustly(structured_res.eta)
                    except Exception:
                        pass
                for item in structured_res.identifiers:
                    if item.identifier_value != primary_ref and not any(ei["identifier_value"] == item.identifier_value for ei in extra_identifiers):
                        extra_identifiers.append({
                            "identifier_type": item.identifier_type,
                            "identifier_value": item.identifier_value
                        })
        except Exception as llm_err:
            logger.warning(f"LLM extraction fallback failed: {str(llm_err)}")

    return {
        "primary_reference": primary_ref,
        "carrier": carrier,
        "origin_port": origin_port,
        "destination_port": dest_port,
        "eta": eta,
        "identifiers": extra_identifiers
    }

def quarantine_raw_email(db: Session, tenant_id: str, raw_freight: FreightRawEmail, error_msg: str):
    raw_freight.parsing_status = "quarantined"
    raw_freight.parsing_error = error_msg
    db.add(raw_freight)
    
    extraction = FreightEmailExtraction(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        raw_email_id=raw_freight.id,
        shipment_id=None,
        extraction_status="quarantined",
        extracted_fields={"error": error_msg},
        confidence_score=0.0
    )
    db.add(extraction)
    
    event = FreightEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        shipment_id=None,
        event_type="quarantined",
        payload={
            "raw_email_id": raw_freight.id,
            "subject": raw_freight.subject,
            "from_address": raw_freight.from_address,
            "error": error_msg
        },
        created_by="system"
    )
    db.add(event)
    
    review_item = ReviewItem(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        object_type="RAW_EMAIL",
        object_id=raw_freight.id,
        status="PENDING",
        confidence_score=0.0,
        reason=error_msg,
        payload={
            "raw_email_id": raw_freight.id,
            "subject": raw_freight.subject,
            "from_address": raw_freight.from_address,
            "body": raw_freight.raw_body
        }
    )
    db.add(review_item)
    
    db.commit()

def upsert_shipment_from_extraction(db: Session, tenant_id: str, raw_freight: FreightRawEmail, extracted: dict) -> FreightShipment:
    primary_ref = extracted["primary_reference"]
    
    # Check if there is an existing shipment with the primary_ref
    shipment = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.primary_reference == primary_ref
    ).first()
    
    is_new = False
    if not shipment:
        # Try checking identifiers for existing shipment association
        existing_ident = db.query(FreightShipmentIdentifier).filter(
            FreightShipmentIdentifier.tenant_id == tenant_id,
            FreightShipmentIdentifier.identifier_value == primary_ref
        ).first()
        if existing_ident:
            shipment = existing_ident.shipment
        else:
            shipment = FreightShipment(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                primary_reference=primary_ref,
                created_at=datetime.datetime.utcnow(),
                is_closed=False
            )
            db.add(shipment)
            is_new = True

    # Update fields if extracted values are present
    if extracted.get("carrier"):
        shipment.carrier = extracted["carrier"]
    if extracted.get("origin_port"):
        shipment.origin_port = extracted["origin_port"]
    if extracted.get("destination_port"):
        shipment.destination_port = extracted["destination_port"]
    if extracted.get("eta"):
        shipment.eta = extracted["eta"]
        
    shipment.updated_at = datetime.datetime.utcnow()
    shipment.status_source = "email"
    
    db.flush()
    
    # Sync primary identifier
    primary_ident = db.query(FreightShipmentIdentifier).filter(
        FreightShipmentIdentifier.tenant_id == tenant_id,
        FreightShipmentIdentifier.shipment_id == shipment.id,
        FreightShipmentIdentifier.identifier_type == "booking_ref",
        FreightShipmentIdentifier.identifier_value == primary_ref
    ).first()
    
    if not primary_ident:
        primary_ident = FreightShipmentIdentifier(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            shipment_id=shipment.id,
            identifier_type="booking_ref",
            identifier_value=primary_ref,
            source="email"
        )
        db.add(primary_ident)
        
    # Sync other identifiers
    for ident_data in extracted.get("identifiers", []):
        itype = ident_data["identifier_type"]
        ivalue = ident_data["identifier_value"]
        
        existing_ident = db.query(FreightShipmentIdentifier).filter(
            FreightShipmentIdentifier.tenant_id == tenant_id,
            FreightShipmentIdentifier.identifier_type == itype,
            FreightShipmentIdentifier.identifier_value == ivalue
        ).first()
        
        if not existing_ident:
            new_ident = FreightShipmentIdentifier(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                shipment_id=shipment.id,
                identifier_type=itype,
                identifier_value=ivalue,
                source="email"
            )
            db.add(new_ident)

    # Success extraction log
    extraction = FreightEmailExtraction(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        raw_email_id=raw_freight.id,
        shipment_id=shipment.id,
        extraction_status="success" if all([shipment.carrier, shipment.origin_port, shipment.destination_port]) else "partial",
        extracted_fields=make_json_serializable(extracted),
        confidence_score=0.9 if primary_ref else 0.5
    )
    db.add(extraction)
    
    # Update status on raw email
    raw_freight.parsing_status = "parsed"
    db.add(raw_freight)
    
    # Events
    if is_new:
        event_created = FreightEvent(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            shipment_id=shipment.id,
            event_type="shipment_created",
            payload={"primary_reference": primary_ref},
            created_by="system"
        )
        db.add(event_created)
        
    event_ingested = FreightEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        shipment_id=shipment.id,
        event_type="email_ingested",
        payload={"raw_email_id": raw_freight.id, "subject": raw_freight.subject},
        created_by="system"
    )
    db.add(event_ingested)
    
    db.commit()
    return shipment

def parse_and_process_email(db: Session, tenant_id: str, raw_freight: FreightRawEmail):
    try:
        from neuromail.core.raw_email import trackflow_extraction_pipeline
        return trackflow_extraction_pipeline.run(db, raw_freight.id, tenant_id)
    except Exception as e:
        db.rollback()
        logger.exception("Error processing freight email via TrackFlow pipeline")
        quarantine_raw_email(db, tenant_id, raw_freight, f"Error processing freight email: {str(e)}")
        return None

def freight_ingest_emails(db: Session, tenant_id: str) -> int:
    cfg = get_tenant_config(db, tenant_id)
    
    emails_query = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id)
    if cfg.last_ingestion_at:
        emails_query = emails_query.filter(RawEmail.received_at > cfg.last_ingestion_at)
        
    emails = emails_query.order_by(RawEmail.received_at.asc()).all()
    
    ingested_count = 0
    for email in emails:
        if not matches_config(email, cfg):
            continue
            
        # Deduplication
        provider = "other"
        if email.mailbox:
            provider = email.mailbox.provider_type.lower()
            
        existing = db.query(FreightRawEmail).filter(
            FreightRawEmail.tenant_id == tenant_id,
            FreightRawEmail.provider == provider,
            FreightRawEmail.provider_message_id == email.provider_message_id
        ).first()
        
        if existing:
            continue
            
        raw_freight = FreightRawEmail(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            mailbox_id=email.mailbox_id,
            provider=provider,
            provider_message_id=email.provider_message_id,
            subject=email.subject,
            from_address=email.sender,
            received_at=email.received_at,
            raw_headers=email.normalized_metadata or {},
            raw_body=email.body,
            parsing_status="pending"
        )
        db.add(raw_freight)
        try:
            db.commit()
            db.refresh(raw_freight)
        except IntegrityError:
            db.rollback()
            continue
            
        parse_and_process_email(db, tenant_id, raw_freight)
        ingested_count += 1
        
    if emails:
        cfg.last_ingestion_at = max(e.received_at for e in emails)
        db.add(cfg)
        db.commit()
        
    return ingested_count

def get_dashboard_summary(db: Session, tenant_id: str) -> dict:
    from sqlalchemy import and_
    now = datetime.datetime.utcnow()
    yesterday = now - datetime.timedelta(days=1)
    
    # 1. Total shipments count
    total_shipments = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id).count()
    total_shipments_yesterday = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.created_at <= yesterday
    ).count()
    total_shipments_delta = total_shipments - total_shipments_yesterday
    
    # 2. Arrived shipments count
    sub_arrived = db.query(FreightCarrierSnapshot.shipment_id).filter(
        FreightCarrierSnapshot.tenant_id == tenant_id,
        FreightCarrierSnapshot.is_arrived == True
    ).subquery()
    shipments_arrived = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.id.in_(sub_arrived)
    ).count()
    
    sub_arrived_yesterday = db.query(FreightCarrierSnapshot.shipment_id).filter(
        FreightCarrierSnapshot.tenant_id == tenant_id,
        FreightCarrierSnapshot.is_arrived == True,
        FreightCarrierSnapshot.synced_at <= yesterday
    ).subquery()
    shipments_arrived_yesterday = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.id.in_(sub_arrived_yesterday)
    ).count()
    shipments_arrived_delta = shipments_arrived - shipments_arrived_yesterday
    
    # 3. Delayed shipments count
    sub_delayed = db.query(FreightCarrierSnapshot.shipment_id).filter(
        FreightCarrierSnapshot.tenant_id == tenant_id,
        FreightCarrierSnapshot.is_delayed == True
    ).subquery()
    shipments_delayed = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.id.in_(sub_delayed)
    ).count()
    
    # 4. No update shipments
    from models import FreightTenantConfig
    cfg = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    threshold_hrs = cfg.no_update_threshold_hours if cfg else 24
    threshold = now - datetime.timedelta(hours=threshold_hrs)
    shipments_no_update = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.updated_at <= threshold,
        FreightShipment.is_closed == False
    ).count()
    
    # 5. Alerts
    open_alerts_all = db.query(FreightAlert).filter(
        FreightAlert.tenant_id == tenant_id,
        FreightAlert.status == "open"
    ).all()
    
    alerts_by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for a in open_alerts_all:
        sev = (a.severity or "MEDIUM").upper()
        if sev in alerts_by_severity:
            alerts_by_severity[sev] += 1
            
    # 6. Quarantine
    quarantine_count = db.query(FreightRawEmail).filter(
        FreightRawEmail.tenant_id == tenant_id,
        FreightRawEmail.parsing_status == "quarantined"
    ).count()
    
    return {
        "total_shipments": total_shipments,
        "shipments_arrived": shipments_arrived,
        "shipments_delayed": shipments_delayed,
        "shipments_no_update": shipments_no_update,
        "alerts_open_by_severity": alerts_by_severity,
        "quarantine_count": quarantine_count,
        "avg_hours_since_update": 0, # Placeholder
        "total_shipments_delta": total_shipments_delta,
        "shipments_arrived_delta": shipments_arrived_delta,
        "shipments_delayed_delta": 0,
        "alerts_open_delta": 0
    }

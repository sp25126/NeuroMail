import uuid
import datetime
import logging
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session

from models import (
    FreightRawEmail,
    FreightShipment,
    FreightShipmentIdentifier,
    FreightEmailExtraction,
    FreightEvent,
    FreightTenantConfig,
    TrackflowFieldProvenance,
    ReviewItem
)
from services.freight_service import parse_date_robustly, quarantine_raw_email
from neuromail.core.raw_email import trackflow_deterministic_parser, trackflow_ai_extractor
from neuromail.core.raw_email.trackflow_deterministic_parser import (
    DeterministicExtractionResult,
    ExtractedField,
    ExtractedIdentifier,
    ExtractedPort
)
from neuromail.core.raw_email.trackflow_ai_extractor import AIExtractionError, TrackflowAIExtractor

logger = logging.getLogger("TrackFlow.ExtractionPipeline")

def merge_results(
    det_result: DeterministicExtractionResult,
    ai_result: Dict[str, Any]
) -> DeterministicExtractionResult:
    """
    Merges deterministic parser outputs with AI extraction outputs.
    Deterministic results take precedence if they are populated with high confidence (1.0).
    AI values populate missing fields.
    """
    merged_fields = {}
    model_used = ai_result.get("_model_used")

    for key in ["booking_ref", "container_id", "bl_number", "po_number", "carrier", "origin_port", "destination_port", "vessel", "eta"]:
        det_f = det_result.fields.get(key)
        ai_f = ai_result.get(key)

        val = det_f.value if det_f else None
        conf = det_f.confidence if det_f else 0.0
        method = "deterministic"
        model_name = None

        if ai_f and ai_f.get("value") is not None:
            # If deterministic was not found (confidence 0.0), use AI value and confidence
            if conf == 0.0:
                val = ai_f.get("value")
                conf = ai_f.get("confidence", 0.0)
                method = "ai_assisted"
                model_name = model_used

        merged_fields[key] = ExtractedField(value=val, confidence=conf, method=method)

    # Recalculate primary reference
    primary_reference = (
        merged_fields["booking_ref"].value or 
        merged_fields["bl_number"].value or 
        merged_fields["container_id"].value
    )

    # Recalculate identifiers list
    identifiers = []
    if merged_fields["booking_ref"].value:
        identifiers.append(ExtractedIdentifier("booking_ref", merged_fields["booking_ref"].value, merged_fields["booking_ref"].confidence))
    if merged_fields["container_id"].value:
        identifiers.append(ExtractedIdentifier("container_id", merged_fields["container_id"].value, merged_fields["container_id"].confidence))
    if merged_fields["bl_number"].value:
        identifiers.append(ExtractedIdentifier("bl_number", merged_fields["bl_number"].value, merged_fields["bl_number"].confidence))
    if merged_fields["po_number"].value:
        identifiers.append(ExtractedIdentifier("po_number", merged_fields["po_number"].value, merged_fields["po_number"].confidence))

    # Recalculate ports
    ports = []
    if merged_fields["origin_port"].value:
        ports.append(ExtractedPort("origin", merged_fields["origin_port"].value, merged_fields["origin_port"].confidence))
    if merged_fields["destination_port"].value:
        ports.append(ExtractedPort("destination", merged_fields["destination_port"].value, merged_fields["destination_port"].confidence))

    # Parse merged ETA
    eta_val = merged_fields["eta"].value
    eta_dt = None
    if eta_val:
        if isinstance(eta_val, datetime.datetime):
            eta_dt = eta_val
        else:
            eta_dt = parse_date_robustly(str(eta_val))

    # Recalculate overall confidence
    confidence = 0.0
    if primary_reference:
        confidence += 0.5
    if merged_fields["carrier"].value:
        confidence += 0.2
    if eta_dt:
        confidence += 0.2
    
    has_other_field = False
    if merged_fields["po_number"].value:
        has_other_field = True
    if merged_fields["vessel"].value:
        has_other_field = True
    if merged_fields["origin_port"].value or merged_fields["destination_port"].value:
        has_other_field = True
    extra_idents = [i for i in identifiers if i.identifier_value != primary_reference]
    if extra_idents:
        has_other_field = True

    if has_other_field:
        confidence += 0.1

    confidence = min(confidence, 1.0)

    # Re-wrap in ExtractionResult
    return DeterministicExtractionResult(
        primary_reference=primary_reference,
        carrier=merged_fields["carrier"].value,
        identifiers=identifiers,
        ports=ports,
        eta=eta_dt,
        confidence=confidence,
        fields=merged_fields,
        extraction_method="ai_assisted"
    )

def upsert_shipment_from_extraction(
    db: Session,
    tenant_id: str,
    final_result: DeterministicExtractionResult
) -> FreightShipment:
    """
    Creates or updates the canonical shipment record based on the extraction result.
    """
    primary_ref = final_result.primary_reference
    
    # Check if there is an existing shipment with the primary_ref
    shipment = db.query(FreightShipment).filter(
        FreightShipment.tenant_id == tenant_id,
        FreightShipment.primary_reference == primary_ref
    ).first()
    
    is_new = False
    if not shipment:
        # Check identifiers mapping to find existing shipment
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

    # Update shipment attributes
    if final_result.carrier:
        shipment.carrier = final_result.carrier
    
    origin_f = final_result.fields.get("origin_port")
    if origin_f and origin_f.value:
        shipment.origin_port = origin_f.value

    dest_f = final_result.fields.get("destination_port")
    if dest_f and dest_f.value:
        shipment.destination_port = dest_f.value

    if final_result.eta:
        shipment.eta = final_result.eta
        
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
    for ident in final_result.identifiers:
        if ident.identifier_value == primary_ref:
            continue
        existing_ident = db.query(FreightShipmentIdentifier).filter(
            FreightShipmentIdentifier.tenant_id == tenant_id,
            FreightShipmentIdentifier.identifier_type == ident.identifier_type,
            FreightShipmentIdentifier.identifier_value == ident.identifier_value
        ).first()
        if not existing_ident:
            new_ident = FreightShipmentIdentifier(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                shipment_id=shipment.id,
                identifier_type=ident.identifier_type,
                identifier_value=ident.identifier_value,
                source="email"
            )
            db.add(new_ident)

    db.flush()
    return shipment

def stamp_provenance(
    db: Session,
    tenant_id: str,
    shipment_id: str,
    raw_email_id: str,
    extraction_method: str,
    fields: Dict[str, ExtractedField]
):
    """
    Stamps provenance records for every extracted field in a transactionally idempotent way.
    """
    # Delete existing provenance records for this email first
    db.query(TrackflowFieldProvenance).filter(
        TrackflowFieldProvenance.raw_email_id == raw_email_id
    ).delete()
    
    # Insert new stamps
    for field_name, f in fields.items():
        if f.value is not None:
            # Determine method and model for this specific field
            f_method = f.method
            f_model = None
            if f_method == "ai_assisted":
                # Fall back to extraction_method if specific model not annotated
                f_model = getattr(f, "model_name", None) or "gpt-4o"
            
            prov = TrackflowFieldProvenance(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                shipment_id=shipment_id,
                raw_email_id=raw_email_id,
                field_name=field_name,
                field_value=str(f.value),
                extraction_method=f_method,
                extraction_model=f_model,
                confidence=f.confidence,
                created_at=datetime.datetime.utcnow()
            )
            db.add(prov)
    db.flush()

def run(db: Session, raw_email_id: str, tenant_id: str) -> Optional[FreightShipment]:
    """
    Coordinates the deterministic parser and AI fallback extraction, upserts shipments, and records provenance.
    """
    raw_email = db.query(FreightRawEmail).filter(FreightRawEmail.id == raw_email_id).first()
    if not raw_email:
        logger.error(f"Freight raw email not found: {raw_email_id}")
        return None

    # Load Tenant Freight configurations
    tenant_config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    if not tenant_config:
        # Create a default freight config if missing
        tenant_config = FreightTenantConfig(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            sync_interval_minutes=30,
            no_update_threshold_hours=24,
            storage_risk_days=3,
            freight_subject_patterns=[],
            freight_from_addresses=[],
            active_carriers=[],
            notification_email_addresses=[],
            alert_severity_threshold="medium",
            ai_extraction_enabled=True,
            primary_ai_model="gpt-4o",
            fallback_ai_model="claude-3-5-sonnet",
            extraction_confidence_threshold=0.7,
            quarantine_threshold=0.3,
            max_email_body_chars_for_ai=8000
        )
        db.add(tenant_config)
        db.flush()

    # 1. Deterministic Extraction
    logger.info(f"Running deterministic parser on email {raw_email_id}...")
    det_rules = tenant_config.freight_subject_patterns or []
    det_result = trackflow_deterministic_parser.parse(raw_email, det_rules)

    final_result = det_result
    extraction_method = "deterministic"
    ai_raw_response = None
    ai_error_log = None

    # 2. AI Fallback check
    if det_result.confidence >= tenant_config.extraction_confidence_threshold:
        logger.info(f"Deterministic parser confidence {det_result.confidence} met threshold {tenant_config.extraction_confidence_threshold}.")
    else:
        if tenant_config.ai_extraction_enabled:
            logger.info(f"Deterministic parser confidence {det_result.confidence} below threshold. Triggering AI fallback...")
            ai_extractor = TrackflowAIExtractor(db)
            try:
                ai_result = ai_extractor.extract(raw_email, det_result, tenant_config)
                ai_raw_response = ai_result.get("_raw_response")
                final_result = merge_results(det_result, ai_result)
                extraction_method = "ai_assisted"
            except AIExtractionError as e:
                logger.warning(f"AI extraction failed or was unavailable: {e}. Degrading to deterministic-only.")
                # We degrade gracefully: do not crash or quarantine yet, keep deterministic results
                final_result = det_result
                extraction_method = "deterministic_only_ai_failed"
                ai_error_log = str(e)
        else:
            logger.info("AI extraction is disabled. Using deterministic-only result.")
            final_result = det_result
            extraction_method = "deterministic_only"

    # 3. Check for primary reference
    if not final_result.primary_reference:
        logger.warning(f"Quarantining raw email {raw_email_id}: no primary reference (booking ref/container/BL) found.")
        quarantine_raw_email(db, tenant_id, raw_email, "no_primary_reference_found")
        return None

    # 4. Check confidence vs quarantine threshold
    if final_result.confidence < tenant_config.quarantine_threshold:
        logger.warning(f"Quarantining raw email {raw_email_id}: confidence {final_result.confidence} below quarantine threshold {tenant_config.quarantine_threshold}.")
        quarantine_raw_email(db, tenant_id, raw_email, f"low_confidence (score: {final_result.confidence})")
        return None

    # 5. Upsert canonical shipment
    logger.info(f"Upserting shipment for reference {final_result.primary_reference}...")
    shipment = upsert_shipment_from_extraction(db, tenant_id, final_result)

    # 6. Stamp Provenance
    logger.info(f"Stamping field provenance for shipment {shipment.id}...")
    stamp_provenance(db, tenant_id, shipment.id, raw_email_id, extraction_method, final_result.fields)

    # 7. Log extraction record
    logger.info(f"Recording extraction run for raw_email {raw_email_id}...")
    # Delete existing extraction record to guarantee idempotency
    db.query(FreightEmailExtraction).filter(FreightEmailExtraction.raw_email_id == raw_email_id).delete()
    
    # Store extraction method and debug logs in extracted_fields JSON
    serialized_fields = {}
    for k, f in final_result.fields.items():
        serialized_fields[k] = {
            "value": f.value,
            "confidence": f.confidence,
            "method": f.method
        }
    
    # Debug payload for UI operators
    debug_payload = {
        "raw_ai_response": ai_raw_response,
        "ai_error": ai_error_log,
        "deterministic_result": {
            "primary_reference": det_result.primary_reference,
            "confidence": det_result.confidence,
            "fields": {k: {"value": f.value, "confidence": f.confidence} for k, f in det_result.fields.items()}
        }
    }

    extraction = FreightEmailExtraction(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        raw_email_id=raw_email_id,
        shipment_id=shipment.id,
        extraction_status="success" if final_result.confidence >= 0.8 else "partial",
        extracted_fields={
            "fields": serialized_fields,
            "debug": debug_payload
        },
        confidence_score=final_result.confidence
    )
    db.add(extraction)

    # Update raw email status
    raw_email.parsing_status = "parsed"
    db.add(raw_email)

    # Ingest event
    event = FreightEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        shipment_id=shipment.id,
        event_type="email_ingested",
        payload={"raw_email_id": raw_email_id, "subject": raw_email.subject},
        created_by="system"
    )
    db.add(event)

    db.commit()
    logger.info(f"Extraction pipeline completed successfully for raw_email {raw_email_id}.")
    return shipment

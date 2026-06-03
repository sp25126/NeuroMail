import uuid
import datetime
import time
import logging
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from models import (
    FreightShipment,
    FreightShipmentIdentifier,
    FreightEvent,
    FreightCarrierSnapshot,
    FreightSyncRun,
    FreightTenantConfig
)
from neuromail.core.mailboxes.carrier_adapter import carrier_registry, CarrierStatusResult
from services.rules_engine import RuleContext, evaluate_rules
from services.alert_lifecycle import get_or_create_alert
from services.notification_dispatch import dispatch_notifications
from neuromail.core.mailboxes.rate_limiter import RateLimitError
import redis
from config import settings

logger = logging.getLogger("Freight.TrackingService")

def get_redis_client():
    if not settings.REDIS_URL:
        return None
    try:
        return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Could not connect to Redis: {str(e)}")
        return None

def acquire_tenant_lock(redis_client, tenant_id: str, expire_seconds: int = 600) -> bool:
    lock_key = f"lock:freight_sync:{tenant_id}"
    return bool(redis_client.set(lock_key, "locked", ex=expire_seconds, nx=True))

def release_tenant_lock(redis_client, tenant_id: str):
    lock_key = f"lock:freight_sync:{tenant_id}"
    redis_client.delete(lock_key)

def check_rate_limit(redis_client, tenant_id: str, carrier: str, rate: int = 10, capacity: int = 10) -> bool:
    key = f"limiter:freight:{tenant_id}:{carrier.lower()}"
    now = time.time()
    state = redis_client.get(key)
    if state:
        try:
            state_data = json.loads(state)
            last_tokens = state_data["tokens"]
            last_time = state_data["timestamp"]
        except Exception:
            last_tokens = float(capacity)
            last_time = now
    else:
        last_tokens = float(capacity)
        last_time = now
        
    elapsed = now - last_time
    refill = elapsed * (rate / 60.0)
    current_tokens = min(float(capacity), last_tokens + refill)
    
    if current_tokens >= 1.0:
        current_tokens -= 1.0
        redis_client.set(key, json.dumps({"tokens": current_tokens, "timestamp": now}))
        return True
    else:
        return False

def map_to_dcsa_milestone(event_code: str) -> str:
    code = event_code.upper().strip()
    if "ARRIV" in code or "ARRI" in code:
        return "ARRIVAL"
    if "DEPAR" in code or "DEPA" in code:
        return "DEPARTURE"
    if "PICK" in code or "AVAIL" in code:
        return "AVAILABLE_FOR_PICKUP"
    if "GATE_IN" in code or "GATE-IN" in code or "GATEIN" in code or "INB" in code or "IN-GATE" in code:
        return "GATE_IN"
    if "GATE_OUT" in code or "GATE-OUT" in code or "GATEOUT" in code or "OUB" in code or "OUT-GATE" in code:
        return "GATE_OUT"
    return "ARRIVAL"

def sync_single_shipment(db: Session, tenant_id: str, shipment: FreightShipment, run_id: Optional[str] = None) -> dict:
    now = datetime.datetime.utcnow()
    
    # 1. Fetch auxiliary identifiers
    idents = db.query(FreightShipmentIdentifier).filter(
        FreightShipmentIdentifier.shipment_id == shipment.id,
        FreightShipmentIdentifier.tenant_id == tenant_id
    ).all()
    
    best_ident = None
    best_ident_type = "primary_reference"
    
    container = next((i for i in idents if i.identifier_type == "container_id"), None)
    bol = next((i for i in idents if i.identifier_type == "bill_of_lading"), None)
    booking = next((i for i in idents if i.identifier_type == "booking_number"), None)
    
    if container:
        best_ident = container.identifier_value
        best_ident_type = "container_id"
    elif bol:
        best_ident = bol.identifier_value
        best_ident_type = "bill_of_lading"
    elif booking:
        best_ident = booking.identifier_value
        best_ident_type = "booking_number"
    else:
        best_ident = shipment.primary_reference
        best_ident_type = "primary_reference"
        
    # 2. Resolve adapter
    carrier_name = shipment.carrier or "Fallback"
    adapter = carrier_registry.resolve(carrier_name, best_ident_type)
    if not adapter:
        raise ValueError(f"No adapter registered for carrier {carrier_name} and identifier {best_ident_type}")
        
    # Rate Limiting check
    r_client = get_redis_client()
    if r_client:
        limit_rate = 10
        if "terminal49" in adapter.carrier_name.lower():
            limit_rate = 5
        if not check_rate_limit(r_client, tenant_id, adapter.carrier_name, rate=limit_rate, capacity=limit_rate):
            raise RateLimitError(f"Rate limit exceeded for carrier {adapter.carrier_name}")
            
    # 3. Call adapter to fetch current status
    result: CarrierStatusResult = adapter.fetch_status(best_ident, best_ident_type, db=db, tenant_id=tenant_id)
    
    # 4. Get previous snapshot
    previous_snapshot = db.query(FreightCarrierSnapshot).filter(
        FreightCarrierSnapshot.shipment_id == shipment.id,
        FreightCarrierSnapshot.tenant_id == tenant_id
    ).order_by(FreightCarrierSnapshot.synced_at.desc()).first()
    
    # 5. Save carrier snapshot
    snapshot = FreightCarrierSnapshot(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        shipment_id=shipment.id,
        carrier_adapter=adapter.carrier_name,
        reference_used=best_ident,
        carrier_status=result.carrier_status,
        location=result.location,
        eta=result.eta,
        vessel_name=result.vessel_name,
        last_event=result.last_event,
        last_event_at=result.last_event_at,
        is_arrived=result.is_arrived,
        is_delayed=result.is_delayed,
        raw_response=result.raw_response,
        synced_at=now
    )
    db.add(snapshot)
    db.flush()
    
    # 6. Update shipment model fields
    old_status = shipment.last_known_status
    old_eta = shipment.eta
    
    shipment.last_known_status = result.carrier_status
    if result.eta:
        shipment.eta = result.eta
        
    if old_status != result.carrier_status or not shipment.last_status_at:
        shipment.last_status_at = now
        
    shipment.updated_at = now
    shipment.status_source = "carrier_api"
    db.add(shipment)
    
    # 7. Append status change event
    status_changed = (old_status != result.carrier_status) or (old_eta != result.eta)
    if status_changed:
        event = FreightEvent(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            shipment_id=shipment.id,
            event_type="status_changed",
            payload={
                "old_status": old_status,
                "new_status": result.carrier_status,
                "old_eta": old_eta.isoformat() if old_eta else None,
                "new_eta": result.eta.isoformat() if result.eta else None,
                "location": result.location,
                "event_name": result.last_event
            },
            created_at=now,
            created_by="system"
        )
        db.add(event)
        
    # 8. Sync milestones events if available
    if hasattr(result, 'events') and result.events:
        existing_events = db.query(FreightEvent).filter(
            FreightEvent.shipment_id == shipment.id,
            FreightEvent.tenant_id == tenant_id
        ).all()
        existing_event_ids = set()
        for e in existing_events:
            if e.payload and isinstance(e.payload, dict):
                eid = e.payload.get("event_id")
                if eid:
                    existing_event_ids.add(eid)
                    
        for ev in result.events:
            event_id = ev["event_id"]
            if event_id not in existing_event_ids:
                dcsa_milestone = map_to_dcsa_milestone(ev["milestone_code"])
                event = FreightEvent(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    shipment_id=shipment.id,
                    event_type="field_updated",
                    payload={
                        "event_id": event_id,
                        "milestone": dcsa_milestone,
                        "location": ev.get("location_name"),
                        "event_time": ev["event_time"].isoformat(),
                        "raw": ev["raw_payload"]
                    },
                    created_by="system"
                )
                db.add(event)
                
    db.flush()
    
    # 9. Evaluate rules & create/dispatch alerts
    from models import FreightAlert
    existing_alerts = db.query(FreightAlert).filter(
        FreightAlert.tenant_id == tenant_id,
        FreightAlert.shipment_id == shipment.id
    ).all()
    
    tenant_config = db.query(FreightTenantConfig).filter(
        FreightTenantConfig.tenant_id == tenant_id
    ).first()
    
    context = RuleContext(
        tenant_id=tenant_id,
        shipment=shipment,
        latest_snapshot=snapshot,
        previous_snapshot=previous_snapshot,
        tenant_config=tenant_config,
        existing_alerts=existing_alerts,
        now=now
    )
    
    matches = evaluate_rules(context)
    for match in matches:
        alert = get_or_create_alert(
            db=db,
            tenant_id=tenant_id,
            shipment_id=shipment.id,
            rule_type=match.rule_type,
            severity=match.severity,
            title=match.title,
            description=match.description,
            now=now
        )
        if alert:
            try:
                dispatch_notifications(db, tenant_id, alert)
            except Exception as dispatch_err:
                logger.error(f"Failed to dispatch notifications for alert {alert.id}: {str(dispatch_err)}")
                
    db.commit()
    
    return {
        "shipment_id": shipment.id,
        "status": result.carrier_status,
        "is_arrived": result.is_arrived,
        "is_delayed": result.is_delayed
    }

def run_tracking_sync(db: Session, tenant_id: str, run_type: str = "manual") -> int:
    now = datetime.datetime.utcnow()
    r_client = get_redis_client()
    
    # Enforce Distributed Lock per Tenant
    if r_client:
        if not acquire_tenant_lock(r_client, tenant_id):
            logger.warning(f"Tenant sync already running for tenant {tenant_id}. Aborting.")
            return 0
            
    try:
        from sqlalchemy import or_
        # Load all active shipments for tenant
        active_shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id,
            FreightShipment.is_closed == False,
            or_(
                FreightShipment.last_known_status == None,
                FreightShipment.last_known_status != "DELIVERED"
            )
        ).all()
        
        # Start a sync run auditor
        sync_run = FreightSyncRun(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            run_type=run_type,
            started_at=now,
            total_shipments=len(active_shipments),
            succeeded=0,
            failed=0,
            skipped=0,
            errors=[]
        )
        db.add(sync_run)
        db.commit()
        
        succeeded_count = 0
        failed_count = 0
        skipped_count = 0
        errors_list = []
        
        for shipment in active_shipments:
            try:
                sync_single_shipment(db, tenant_id, shipment, run_id=sync_run.id)
                succeeded_count += 1
            except RateLimitError as e:
                skipped_count += 1
                errors_list.append({"shipment_id": shipment.id, "error": f"RateLimit: {str(e)}"})
                logger.warning(f"Rate limited during sync for shipment {shipment.id}: {str(e)}")
            except Exception as e:
                failed_count += 1
                errors_list.append({"shipment_id": shipment.id, "error": str(e)})
                logger.error(f"Sync failed for shipment {shipment.id}: {str(e)}")
                
        # Complete sync run
        sync_run.completed_at = datetime.datetime.utcnow()
        sync_run.succeeded = succeeded_count
        sync_run.failed = failed_count
        sync_run.skipped = skipped_count
        sync_run.errors = errors_list
        db.add(sync_run)
        db.commit()
        
        return succeeded_count
        
    finally:
        if r_client:
            release_tenant_lock(r_client, tenant_id)

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
    FreightTenantConfig,
    ShipmentTrackingBinding,
    FreightProviderConnection
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

def get_shipment_binding(db: Session, tenant_id: str, shipment_id: str, provider_name: str) -> Optional[ShipmentTrackingBinding]:
    return db.query(ShipmentTrackingBinding).filter(
        ShipmentTrackingBinding.tenant_id == tenant_id,
        ShipmentTrackingBinding.shipment_id == shipment_id,
        ShipmentTrackingBinding.provider_name == provider_name
    ).first()

def ensure_shipment_registered(db: Session, tenant_id: str, shipment: FreightShipment, provider_name: str) -> Optional[ShipmentTrackingBinding]:
    binding = get_shipment_binding(db, tenant_id, shipment.id, provider_name)
    if binding and binding.registration_status == "registered":
        return binding
        
    # Resolve adapter instance
    adapter = None
    for a in carrier_registry._adapters:
        if a.carrier_name.lower() == provider_name.lower():
            adapter = a
            break
    
    if not adapter:
        return None

    if not binding:
        binding = ShipmentTrackingBinding(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            shipment_id=shipment.id,
            provider_name=provider_name,
            registration_status="pending"
        )
        db.add(binding)
        db.flush()

    res = adapter.register_tracking(shipment, db, tenant_id)
    binding.last_registration_attempt_at = datetime.datetime.utcnow()
    if res.success:
        binding.registration_status = "registered"
        binding.provider_tracking_id = res.provider_tracking_id
        binding.identifier_type_used = res.identifier_type
        binding.identifier_value_used = res.identifier_used
        binding.failure_reason = None
    else:
        binding.registration_status = "failed"
        binding.failure_reason = res.error_message
    
    db.add(binding)
    db.commit()
    return binding

def sync_single_shipment(db: Session, tenant_id: str, shipment: FreightShipment, run_id: Optional[str] = None) -> dict:
    now = datetime.datetime.utcnow()
    
    # 1. Determine which providers to sync with based on tenant connections
    connections = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.status == "connected"
    ).all()
    
    active_providers = [c.provider_type.lower() for c in connections if c.provider_type.lower() in ["terminal49", "project44"]]
    
    if not active_providers:
        # Fallback sync (legacy behavior or generic polling)
        return {"shipment_id": shipment.id, "status": "no_active_providers"}

    results = []
    for p_name in active_providers:
        # 2. Ensure registered
        binding = ensure_shipment_registered(db, tenant_id, shipment, p_name)
        if not binding or binding.registration_status != "registered":
            continue

        # 3. Resolve adapter
        adapter = None
        for a in carrier_registry._adapters:
            if a.carrier_name.lower() == p_name.lower():
                adapter = a
                break
        
        if not adapter:
            continue
            
        # Rate Limiting check
        r_client = get_redis_client()
        if r_client:
            if not check_rate_limit(r_client, tenant_id, adapter.carrier_name):
                logger.warning(f"Rate limit hit for {p_name}")
                continue
                
        # 4. Fetch Status
        try:
            # Previous snapshot for rule evaluation
            previous_snapshot = db.query(FreightCarrierSnapshot).filter(
                FreightCarrierSnapshot.shipment_id == shipment.id,
                FreightCarrierSnapshot.tenant_id == tenant_id,
                FreightCarrierSnapshot.carrier_adapter == adapter.carrier_name
            ).order_by(FreightCarrierSnapshot.synced_at.desc()).first()

            res: CarrierStatusResult = adapter.fetch_status(
                reference=binding.identifier_value_used,
                identifier_type=binding.identifier_type_used,
                db=db,
                tenant_id=tenant_id,
                provider_tracking_id=binding.provider_tracking_id
            )
            
            # 5. Persistent Snapshot
            snapshot = FreightCarrierSnapshot(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                shipment_id=shipment.id,
                carrier_adapter=adapter.carrier_name,
                reference_used=binding.identifier_value_used,
                carrier_status=res.carrier_status,
                location=res.location,
                eta=res.eta,
                vessel_name=res.vessel_name,
                last_event=res.last_event,
                last_event_at=res.last_event_at,
                is_arrived=res.is_arrived,
                is_delayed=res.is_delayed,
                raw_response=res.raw_response,
                synced_at=now
            )
            db.add(snapshot)
            db.flush()
            
            # 6. Update Shipment state (Precedence: Carrier API > Email)
            old_status = shipment.last_known_status
            old_eta = shipment.eta
            
            shipment.last_known_status = res.carrier_status
            if res.eta:
                shipment.eta = res.eta
            shipment.status_source = f"carrier_api:{p_name}"
            shipment.last_status_at = now
            shipment.updated_at = now
            db.add(shipment)
            
            # 7. Append status change event
            if (old_status != res.carrier_status) or (old_eta != res.eta):
                event = FreightEvent(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    shipment_id=shipment.id,
                    event_type="status_changed",
                    payload={
                        "old_status": old_status,
                        "new_status": res.carrier_status,
                        "old_eta": old_eta.isoformat() if old_eta else None,
                        "new_eta": res.eta.isoformat() if res.eta else None,
                        "location": res.location,
                        "event_name": res.last_event,
                        "source": p_name
                    },
                    created_at=now,
                    created_by="system"
                )
                db.add(event)
            
            # 8. Update binding
            binding.last_sync_at = now
            db.add(binding)
            
            # 9. Evaluate rules
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

            results.append({"provider": p_name, "status": res.carrier_status})
        except Exception as e:
            logger.error(f"Failed to fetch status from {p_name} for shipment {shipment.id}: {e}")
            continue

    db.commit()
    return {"shipment_id": shipment.id, "provider_results": results}

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

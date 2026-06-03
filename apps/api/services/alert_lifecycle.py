import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session

from models import FreightAlert, FreightAlertEvent, FreightShipment

def compute_dedup_key(tenant_id: str, shipment_id: str, rule_type: str, now: datetime) -> str:
    # Use day-level granularity for alert deduplication
    day_str = now.strftime("%Y-%m-%d")
    if rule_type == "STORAGE_RISK":
        # Storage risk deduplication bucket (3-day window)
        epoch = datetime(1970, 1, 1)
        days = (now - epoch).days
        bucket = days // 3
        day_str = f"storage_bucket_{bucket}"
        
    return f"{tenant_id}:{shipment_id}:{rule_type}:{day_str}"

def get_or_create_alert(
    db: Session,
    tenant_id: str,
    shipment_id: str,
    rule_type: str,
    severity: str,
    title: str,
    description: str,
    now: Optional[datetime] = None
) -> Optional[FreightAlert]:
    if not now:
        now = datetime.utcnow()
        
    dedup_key = compute_dedup_key(tenant_id, shipment_id, rule_type, now)
    
    # Check for existing alert with same dedup key
    existing_alert = db.query(FreightAlert).filter(
        FreightAlert.tenant_id == tenant_id,
        FreightAlert.shipment_id == shipment_id,
        FreightAlert.dedup_key == dedup_key
    ).first()
    
    if existing_alert:
        if existing_alert.status in ["open", "acknowledged", "snoozed"]:
            # Skip creation to avoid alert storms
            return None
        elif existing_alert.status in ["resolved", "closed"]:
            # Reopen alert if condition is triggered again
            existing_alert.status = "open"
            existing_alert.resolved_at = None
            db.add(existing_alert)
            
            # Log audit event
            event = FreightAlertEvent(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                alert_id=existing_alert.id,
                action="reopened",
                actor="system",
                note="Reopened automatically by rules engine.",
                created_at=now
            )
            db.add(event)
            db.commit()
            return existing_alert
        return None
        
    # Create new alert
    alert = FreightAlert(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        shipment_id=shipment_id,
        rule_type=rule_type,
        severity=severity,
        title=title,
        description=description,
        status="open",
        dedup_key=dedup_key,
        created_at=now
    )
    db.add(alert)
    db.flush() # Populate alert.id
    
    # Log event
    event = FreightAlertEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="created",
        actor="system",
        note="Triggered by rules engine.",
        created_at=now
    )
    db.add(event)
    db.commit()
    return alert

def acknowledge_alert(db: Session, tenant_id: str, alert_id: str, actor: str, note: Optional[str] = None) -> Optional[FreightAlert]:
    alert = db.query(FreightAlert).filter(
        FreightAlert.id == alert_id,
        FreightAlert.tenant_id == tenant_id
    ).first()
    
    if not alert:
        return None
        
    alert.status = "acknowledged"
    db.add(alert)
    
    event = FreightAlertEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="acknowledged",
        actor=actor,
        note=note,
        created_at=datetime.utcnow()
    )
    db.add(event)
    db.commit()
    return alert

def snooze_alert(db: Session, tenant_id: str, alert_id: str, actor: str, snoozed_until: datetime, note: Optional[str] = None) -> Optional[FreightAlert]:
    alert = db.query(FreightAlert).filter(
        FreightAlert.id == alert_id,
        FreightAlert.tenant_id == tenant_id
    ).first()
    
    if not alert:
        return None
        
    alert.status = "snoozed"
    alert.snoozed_until = snoozed_until
    db.add(alert)
    
    event = FreightAlertEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="snoozed",
        actor=actor,
        note=note or f"Snoozed until {snoozed_until.isoformat()}",
        created_at=datetime.utcnow()
    )
    db.add(event)
    db.commit()
    return alert

def resolve_alert(db: Session, tenant_id: str, alert_id: str, actor: str, note: Optional[str] = None) -> Optional[FreightAlert]:
    alert = db.query(FreightAlert).filter(
        FreightAlert.id == alert_id,
        FreightAlert.tenant_id == tenant_id
    ).first()
    
    if not alert:
        return None
        
    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()
    db.add(alert)
    
    event = FreightAlertEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="resolved",
        actor=actor,
        note=note,
        created_at=datetime.utcnow()
    )
    db.add(event)
    db.commit()
    return alert

def process_expired_snoozes(db: Session, tenant_id: str) -> int:
    now = datetime.utcnow()
    snoozed_alerts = db.query(FreightAlert).filter(
        FreightAlert.tenant_id == tenant_id,
        FreightAlert.status == "snoozed",
        FreightAlert.snoozed_until <= now
    ).all()
    
    for alert in snoozed_alerts:
        alert.status = "open"
        alert.snoozed_until = None
        db.add(alert)
        
        event = FreightAlertEvent(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            alert_id=alert.id,
            action="reopened",
            actor="system",
            note="Snooze window expired.",
            created_at=now
        )
        db.add(event)
        
    db.commit()
    return len(snoozed_alerts)

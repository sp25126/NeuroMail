import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import Alert, AlertHistory
from neuromail.core.raw_email.event_synthesis import synthesize_alert_event

logger = logging.getLogger("RawEmail.AlertService")

def _invalidate_cache(tenant_id: str):
    try:
        from neuromail.core.api.routes.dashboard_router import invalidate_dashboard_cache
        invalidate_dashboard_cache(tenant_id)
    except Exception:
        pass

def create_or_deduplicate_alert(
    db: Session,
    tenant_id: str,
    alert_type: str,
    message: str,
    severity: str = "MEDIUM",
    entity_id: Optional[str] = None,
    rule_id: Optional[str] = None
) -> Alert:
    """
    Idempotently creates an alert. If an unresolved, active alert with the same
    deduplication key exists, increments occurrence_count instead of creating a new record.
    """
    # 1. Compute deduplication key
    dedup_key = f"{tenant_id}:{rule_id or 'manual'}:{entity_id or 'none'}:{alert_type}"
    
    # 2. Look for existing unresolved alerts with this key
    # Active includes UNRESOLVED, ACKNOWLEDGED, and SNOOZED states
    existing_alert = db.query(Alert).filter(
        Alert.tenant_id == tenant_id,
        Alert.deduplication_key == dedup_key,
        Alert.status.in_(["UNRESOLVED", "ACKNOWLEDGED", "SNOOZED"])
    ).first()
    
    if existing_alert:
        existing_alert.occurrence_count += 1
        existing_alert.updated_at = datetime.datetime.utcnow()
        # If it was snoozed, we might want to unsnooze/alert again if new occurrences happen
        existing_alert.status = "UNRESOLVED"
        existing_alert.snoozed_until = None
        db.commit()
        db.refresh(existing_alert)
        logger.info(f"Deduplicated alert {existing_alert.id}: occurrence count is now {existing_alert.occurrence_count}")
        _invalidate_cache(tenant_id)
        return existing_alert
        
    # 3. Create new Alert
    alert = Alert(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        entity_id=entity_id,
        rule_id=rule_id,
        alert_type=alert_type,
        message=message,
        status="UNRESOLVED",
        severity=severity,
        deduplication_key=dedup_key,
        occurrence_count=1
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    logger.info(f"Created new alert {alert.id} of type: {alert_type}")
    
    # Log to AlertHistory
    history = AlertHistory(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="TRIGGERED",
        performed_by="system",
        reason=f"Rule match triggered alert: {message}"
    )
    db.add(history)
    db.commit()
    _invalidate_cache(tenant_id)

    # Log to entity timeline if entity is present
    if entity_id:
        synthesize_alert_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=entity_id,
            alert_id=alert.id,
            alert_type=alert_type,
            severity=severity,
            message=message,
            action="TRIGGERED"
        )
        
    return alert

def acknowledge_alert(db: Session, tenant_id: str, alert_id: str, performed_by: str) -> Alert:
    alert = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.id == alert_id).first()
    if not alert:
        raise ValueError("Alert not found")
        
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_at = datetime.datetime.utcnow()
    alert.assigned_to = performed_by
    alert.updated_at = datetime.datetime.utcnow()
    
    # Log history
    history = AlertHistory(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="ACKNOWLEDGE",
        performed_by=performed_by,
        reason="Acknowledged by operator"
    )
    db.add(history)
    db.commit()
    db.refresh(alert)
    _invalidate_cache(tenant_id)
    
    if alert.entity_id:
        synthesize_alert_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=alert.entity_id,
            alert_id=alert.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            action="ACKNOWLEDGED"
        )
        
    return alert

def resolve_alert(db: Session, tenant_id: str, alert_id: str, performed_by: str, reason: Optional[str] = None) -> Alert:
    alert = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.id == alert_id).first()
    if not alert:
        raise ValueError("Alert not found")
        
    alert.status = "RESOLVED"
    alert.resolved_at = datetime.datetime.utcnow()
    alert.updated_at = datetime.datetime.utcnow()
    
    # Log history
    history = AlertHistory(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="RESOLVE",
        performed_by=performed_by,
        reason=reason or "Resolved by operator"
    )
    db.add(history)
    db.commit()
    db.refresh(alert)
    _invalidate_cache(tenant_id)
    
    if alert.entity_id:
        synthesize_alert_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=alert.entity_id,
            alert_id=alert.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            action="RESOLVED"
        )
        
    return alert

def snooze_alert(
    db: Session,
    tenant_id: str,
    alert_id: str,
    performed_by: str,
    duration_minutes: int,
    reason: Optional[str] = None
) -> Alert:
    alert = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.id == alert_id).first()
    if not alert:
        raise ValueError("Alert not found")
        
    snooze_limit = datetime.datetime.utcnow() + datetime.timedelta(minutes=duration_minutes)
    alert.status = "SNOOZED"
    alert.snoozed_until = snooze_limit
    alert.snooze_reason = reason or f"Snoozed for {duration_minutes} minutes"
    alert.updated_at = datetime.datetime.utcnow()
    
    # Log history
    history = AlertHistory(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="SNOOZE",
        performed_by=performed_by,
        reason=alert.snooze_reason
    )
    db.add(history)
    db.commit()
    db.refresh(alert)
    _invalidate_cache(tenant_id)
    
    if alert.entity_id:
        synthesize_alert_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=alert.entity_id,
            alert_id=alert.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            action="SNOOZED"
        )
        
    return alert

def reopen_alert(db: Session, tenant_id: str, alert_id: str, performed_by: str, reason: Optional[str] = None) -> Alert:
    alert = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.id == alert_id).first()
    if not alert:
        raise ValueError("Alert not found")
        
    alert.status = "UNRESOLVED"
    alert.snoozed_until = None
    alert.snooze_reason = None
    alert.resolved_at = None
    alert.acknowledged_at = None
    alert.updated_at = datetime.datetime.utcnow()
    
    # Log history
    history = AlertHistory(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        alert_id=alert.id,
        action="REOPEN",
        performed_by=performed_by,
        reason=reason or "Reopened by operator"
    )
    db.add(history)
    db.commit()
    db.refresh(alert)
    _invalidate_cache(tenant_id)
    
    if alert.entity_id:
        synthesize_alert_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=alert.entity_id,
            alert_id=alert.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            action="REOPENED"
        )
        
    return alert

def get_alert_history(db: Session, tenant_id: str, alert_id: str) -> List[AlertHistory]:
    return db.query(AlertHistory).filter(
        AlertHistory.tenant_id == tenant_id,
        AlertHistory.alert_id == alert_id
    ).order_by(AlertHistory.performed_at.asc()).all()

import uuid
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from models import Event

logger = logging.getLogger("RawEmail.EventSynthesis")

def create_timeline_event(
    db: Session,
    tenant_id: str,
    entity_id: str,
    event_type: str,
    payload: Dict[str, Any],
    source: str = "SYSTEM",
    created_by: str = "system"
) -> Event:
    """
    Synthesizes and records an append-only timeline event in the database.
    Ensures source provenance and chronological integrity.
    """
    event = Event(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        entity_id=entity_id,
        event_type=event_type,
        payload=payload,
        source=source,
        created_by=created_by
    )
    db.add(event)
    db.commit()
    logger.info(f"Synthesized event {event.id} ({event_type}) for entity: {entity_id}")
    return event

def synthesize_email_parsed_event(
    db: Session,
    tenant_id: str,
    entity_id: str,
    raw_email_id: str,
    subject: str,
    sender: str
) -> Event:
    payload = {
        "raw_email_id": raw_email_id,
        "subject": subject,
        "sender": sender,
        "action": "EMAIL_PARSED_AND_LINKED"
    }
    return create_timeline_event(
        db=db,
        tenant_id=tenant_id,
        entity_id=entity_id,
        event_type="EMAIL_INGESTED",
        payload=payload,
        source="SYSTEM",
        created_by="parser"
    )

def synthesize_entity_status_change_event(
    db: Session,
    tenant_id: str,
    entity_id: str,
    old_status: str,
    new_status: str,
    reason: str,
    performed_by: str
) -> Event:
    payload = {
        "old_status": old_status,
        "new_status": new_status,
        "reason": reason
    }
    return create_timeline_event(
        db=db,
        tenant_id=tenant_id,
        entity_id=entity_id,
        event_type="STATUS_CHANGED",
        payload=payload,
        source="SYSTEM" if performed_by == "system" else "USER",
        created_by=performed_by
    )

def synthesize_alert_event(
    db: Session,
    tenant_id: str,
    entity_id: str,
    alert_id: str,
    alert_type: str,
    severity: str,
    message: str,
    action: str = "TRIGGERED" # "TRIGGERED", "ACKNOWLEDGED", "RESOLVED", "SNOOZED", "REOPENED"
) -> Event:
    payload = {
        "alert_id": alert_id,
        "alert_type": alert_type,
        "severity": severity,
        "message": message,
        "action": action
    }
    return create_timeline_event(
        db=db,
        tenant_id=tenant_id,
        entity_id=entity_id,
        event_type=f"ALERT_{action}",
        payload=payload,
        source="SYSTEM",
        created_by="alert_pipeline"
    )

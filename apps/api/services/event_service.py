import uuid
import datetime
from sqlalchemy.orm import Session
from models import Event, Entity
from services.audit_service import create_audit_log

def append_event(db: Session, tenant_id: str, entity_id: str, event_type: str, payload: dict = None, source: str = "SYSTEM", created_by: str = None) -> Event:
    # Verify entity exists
    entity = db.query(Entity).filter(Entity.id == entity_id, Entity.tenant_id == tenant_id).first()
    if not entity:
        raise ValueError("Entity not found")
        
    event_id = str(uuid.uuid4())
    event = Event(
        id=event_id,
        tenant_id=tenant_id,
        entity_id=entity_id,
        event_type=event_type,
        payload=payload,
        source=source,
        created_by=created_by,
        created_at=datetime.datetime.utcnow()
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    # Audit log (events are writes, so they produce audit trails!)
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="APPEND_EVENT",
        performed_by=created_by or "system",
        object_type="EVENT",
        object_id=event_id,
        changes={
            "entity_id": entity_id,
            "event_type": event_type,
            "source": source
        }
    )
    
    return event

def get_entity_timeline(db: Session, tenant_id: str, entity_id: str):
    return db.query(Event).filter(
        Event.tenant_id == tenant_id,
        Event.entity_id == entity_id
    ).order_by(Event.created_at.asc()).all()

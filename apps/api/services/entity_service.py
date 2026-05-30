import uuid
from sqlalchemy.orm import Session
from models import Entity
from services.audit_service import create_audit_log

def create_entity(db: Session, tenant_id: str, status: str, identity: str = None, source_reference: str = None, metadata_json: dict = None, performed_by: str = "system") -> Entity:
    entity_id = str(uuid.uuid4())
    entity = Entity(
        id=entity_id,
        tenant_id=tenant_id,
        status=status,
        identity=identity,
        source_reference=source_reference,
        metadata_json=metadata_json
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)

    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="CREATE_ENTITY",
        performed_by=performed_by,
        object_type="ENTITY",
        object_id=entity_id,
        changes={
            "status": status,
            "identity": identity,
            "source_reference": source_reference
        }
    )

    return entity

def update_entity(db: Session, tenant_id: str, entity_id: str, status: str = None, identity: str = None, metadata_json: dict = None, performed_by: str = "system") -> Entity:
    entity = db.query(Entity).filter(Entity.id == entity_id, Entity.tenant_id == tenant_id).first()
    if not entity:
        raise ValueError("Entity not found")

    old_status = entity.status
    changes = {}
    if status is not None:
        entity.status = status
        changes["status"] = status
    if identity is not None:
        entity.identity = identity
        changes["identity"] = identity
    if metadata_json is not None:
        entity.metadata_json = metadata_json
        changes["metadata_json"] = metadata_json

    db.commit()
    db.refresh(entity)

    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="UPDATE_ENTITY",
        performed_by=performed_by,
        object_type="ENTITY",
        object_id=entity_id,
        changes={
            "old_status": old_status,
            **changes
        }
    )

    return entity

def get_entity(db: Session, tenant_id: str, entity_id: str) -> Entity:
    return db.query(Entity).filter(Entity.id == entity_id, Entity.tenant_id == tenant_id).first()

def list_entities(db: Session, tenant_id: str):
    return db.query(Entity).filter(Entity.tenant_id == tenant_id).all()

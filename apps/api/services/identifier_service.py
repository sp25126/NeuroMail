import uuid
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from models import Identifier, Entity
from services.audit_service import create_audit_log

def add_identifier(db: Session, tenant_id: str, entity_id: str, identifier_type: str, identifier_value: str, source: str, performed_by: str = "system") -> Identifier:
    # 1. Verify entity exists
    entity = db.query(Entity).filter(Entity.id == entity_id, Entity.tenant_id == tenant_id).first()
    if not entity:
        raise ValueError("Entity not found")
        
    identifier_id = str(uuid.uuid4())
    identifier = Identifier(
        id=identifier_id,
        tenant_id=tenant_id,
        entity_id=entity_id,
        identifier_type=identifier_type,
        identifier_value=identifier_value,
        source=source
    )
    
    try:
        db.add(identifier)
        db.commit()
        db.refresh(identifier)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Identifier {identifier_type}={identifier_value} already mapped for this tenant.")
        
    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="ADD_IDENTIFIER",
        performed_by=performed_by,
        object_type="IDENTIFIER",
        object_id=identifier_id,
        changes={
            "entity_id": entity_id,
            "identifier_type": identifier_type,
            "identifier_value": identifier_value,
            "source": source
        }
    )
    
    return identifier

def resolve_entity_by_identifier(db: Session, tenant_id: str, identifier_type: str, identifier_value: str) -> Entity:
    identifier = db.query(Identifier).filter(
        Identifier.tenant_id == tenant_id,
        Identifier.identifier_type == identifier_type,
        Identifier.identifier_value == identifier_value
    ).first()
    
    if not identifier:
        return None
        
    return identifier.entity

def remove_identifier(db: Session, tenant_id: str, identifier_id: str, performed_by: str = "system"):
    identifier = db.query(Identifier).filter(Identifier.id == identifier_id, Identifier.tenant_id == tenant_id).first()
    if not identifier:
        raise ValueError("Identifier not found")
        
    db.delete(identifier)
    db.commit()
    
    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="REMOVE_IDENTIFIER",
        performed_by=performed_by,
        object_type="IDENTIFIER",
        object_id=identifier_id,
        changes={
            "identifier_type": identifier.identifier_type,
            "identifier_value": identifier.identifier_value
        }
    )

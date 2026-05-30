import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import ReviewItem, Entity, Identifier
from services.audit_service import create_audit_log

logger = logging.getLogger("RawEmail.ReviewService")

def route_to_review_queue(
    db: Session,
    tenant_id: str,
    object_type: str,
    object_id: str,
    confidence_score: float,
    reason: str,
    payload: Dict[str, Any]
) -> ReviewItem:
    """
    Routes a record to the review queue for manual operator validation.
    """
    review_item = ReviewItem(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        object_type=object_type,
        object_id=object_id,
        status="PENDING",
        confidence_score=confidence_score,
        reason=reason,
        payload=payload
    )
    db.add(review_item)
    db.commit()
    db.refresh(review_item)
    logger.info(f"Routed object {object_id} ({object_type}) to review queue item: {review_item.id}")
    return review_item

def approve_review_item(
    db: Session,
    tenant_id: str,
    review_item_id: str,
    reviewed_by: str,
    corrected_payload: Optional[Dict[str, Any]] = None
) -> ReviewItem:
    """
    Approves a review item and applies resolved mappings or inputs to the entity models.
    """
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id
    ).first()
    
    if not item:
        raise ValueError("Review item not found")
    if item.status != "PENDING":
        raise ValueError(f"Review item has already been resolved as {item.status}")

    payload = corrected_payload or item.payload or {}
    
    # Apply changes to domain model based on item details
    # E.g., if we were resolving conflicting identifiers to an entity
    if item.object_type == "RAW_EMAIL" and "extracted_identifiers" in payload:
        entity_id = payload.get("entity_id")
        
        # Determine target entity
        if entity_id:
            entity = db.query(Entity).filter(Entity.tenant_id == tenant_id, Entity.id == entity_id).first()
            if not entity:
                raise ValueError("Target entity not found")
        else:
            # Create a new entity if none was specified
            entity = Entity(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                status="ACTIVE",
                identity=payload.get("identity", "Resolved Entity"),
                source_reference=f"raw_emails/{item.object_id}",
                metadata_json={}
            )
            db.add(entity)
            db.flush()

        # Link approved identifiers
        idents = payload.get("extracted_identifiers", [])
        for ident in idents:
            id_type = ident.get("type")
            id_val = ident.get("value")
            
            existing = db.query(Identifier).filter(
                Identifier.tenant_id == tenant_id,
                Identifier.identifier_type == id_type,
                Identifier.identifier_value == id_val
            ).first()
            
            if not existing:
                new_id = Identifier(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    entity_id=entity.id,
                    identifier_type=id_type,
                    identifier_value=id_val,
                    source="HUMAN_REVIEW"
                )
                db.add(new_id)

    item.status = "APPROVED"
    item.reviewed_by = reviewed_by
    item.reviewed_at = datetime.datetime.utcnow()
    item.payload = payload  # Save corrected payload
    
    db.commit()
    db.refresh(item)
    
    # Audit log
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="APPROVE_REVIEW_ITEM",
        performed_by=reviewed_by,
        object_type="REVIEW_ITEM",
        object_id=item.id,
        changes={"status": "APPROVED", "payload": payload}
    )
    
    logger.info(f"Review item {item.id} approved by: {reviewed_by}")
    return item

def reject_review_item(
    db: Session,
    tenant_id: str,
    review_item_id: str,
    reviewed_by: str
) -> ReviewItem:
    """
    Rejects a review item. Discards the suggested interpretations.
    """
    item = db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.id == review_item_id
    ).first()
    
    if not item:
        raise ValueError("Review item not found")
    if item.status != "PENDING":
        raise ValueError(f"Review item has already been resolved as {item.status}")
        
    item.status = "REJECTED"
    item.reviewed_by = reviewed_by
    item.reviewed_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(item)
    
    # Audit log
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="REJECT_REVIEW_ITEM",
        performed_by=reviewed_by,
        object_type="REVIEW_ITEM",
        object_id=item.id,
        changes={"status": "REJECTED"}
    )
    
    logger.info(f"Review item {item.id} rejected by: {reviewed_by}")
    return item

def get_pending_review_items(db: Session, tenant_id: str) -> List[ReviewItem]:
    return db.query(ReviewItem).filter(
        ReviewItem.tenant_id == tenant_id,
        ReviewItem.status == "PENDING"
    ).order_by(ReviewItem.created_at.desc()).all()

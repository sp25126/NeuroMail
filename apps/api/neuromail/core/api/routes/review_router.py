from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import schemas
from neuromail.core.raw_email import review_service

router = APIRouter(prefix="/review_queue", tags=["Human Review Queue"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("", response_model=List[schemas.ReviewItemResponse])
def get_pending_review_items(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return review_service.get_pending_review_items(db, tenant_id)

@router.post("/{review_item_id}/resolve", response_model=schemas.ReviewItemResponse)
def resolve_review_item(
    review_item_id: str,
    payload: schemas.ReviewItemAction,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    action = payload.action.upper()
    try:
        if action == "APPROVE":
            return review_service.approve_review_item(
                db=db,
                tenant_id=tenant_id,
                review_item_id=review_item_id,
                reviewed_by=payload.performed_by,
                corrected_payload=payload.corrected_payload
            )
        elif action == "REJECT":
            return review_service.reject_review_item(
                db=db,
                tenant_id=tenant_id,
                review_item_id=review_item_id,
                reviewed_by=payload.performed_by
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Must be APPROVE or REJECT.")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

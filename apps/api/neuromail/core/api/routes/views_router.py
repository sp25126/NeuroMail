import uuid
import datetime
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import schemas
from models import SavedView
from neuromail.core.api.rbac import require_viewer
from typing import List

router = APIRouter(prefix="/saved_views", tags=["Saved Views"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.post("", response_model=schemas.SavedViewResponse, status_code=201)
def create_saved_view(
    payload: schemas.SavedViewCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    # If is_default is True, we might want to unset previous default for this target_type
    if payload.is_default:
        db.query(SavedView).filter(
            SavedView.tenant_id == tenant_id,
            SavedView.target_type == payload.target_type,
            SavedView.is_default == True
        ).update({"is_default": False})

    view = SavedView(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=payload.name,
        description=payload.description,
        target_type=payload.target_type,
        filters=payload.filters,
        is_default=payload.is_default if payload.is_default is not None else False
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return view

@router.get("", response_model=List[schemas.SavedViewResponse])
def list_saved_views(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    return db.query(SavedView).filter(SavedView.tenant_id == tenant_id).all()

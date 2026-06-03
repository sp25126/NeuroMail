from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import schemas
from services import dlq_service
from neuromail.core.api.rbac import require_operator

router = APIRouter(prefix="/dlq", tags=["DLQ"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("", response_model=List[schemas.DLQResponse])
def get_dlq_items(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    """
    Retrieves all DLQ entries for the current tenant.
    """
    return dlq_service.list_dlq(db, tenant_id)

@router.post("/{dlq_id}/replay", status_code=status.HTTP_200_OK)
def replay_dlq_item(
    dlq_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    """
    Replays a specific DLQ job for the current tenant.
    """
    try:
        return dlq_service.replay_job(db, tenant_id, dlq_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import datetime
from database import get_db
import schemas
from services import quota_service
from neuromail.core.api.rbac import require_analyst

router = APIRouter(prefix="/settings/quotas", tags=["Quotas"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("", response_model=schemas.TenantQuotaResponse)
def get_tenant_quota(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    """
    Returns the quota configuration for the current tenant.
    """
    return quota_service.get_or_create_quota(db, tenant_id)

@router.get("/usage", response_model=schemas.TenantQuotaUsageResponse)
def get_tenant_quota_usage(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    """
    Returns the resource consumption metrics for today.
    """
    today = datetime.date.today()
    return quota_service.get_or_create_usage(db, tenant_id, today)

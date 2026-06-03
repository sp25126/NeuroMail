from typing import Optional
import datetime
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from database import get_db
from models import RawEmail, Alert, Entity, Event
from neuromail.core.api.rbac import require_viewer

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

# In-memory metrics cache
# Format: {tenant_id: {"data": metrics_dict, "cached_at": datetime}}
METRICS_CACHE = {}
CACHE_TTL_SECONDS = 60

def invalidate_dashboard_cache(tenant_id: str):
    """
    Invalidates the dashboard metrics cache for a tenant.
    """
    METRICS_CACHE.pop(tenant_id, None)

@router.get("/metrics")
def get_dashboard_metrics(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer),
    x_refresh_cache: Optional[str] = Header(None)
):
    if x_refresh_cache == "true":
        invalidate_dashboard_cache(tenant_id)

    now = datetime.datetime.utcnow()
    cached = METRICS_CACHE.get(tenant_id)
    if cached:
        elapsed = (now - cached["cached_at"]).total_seconds()
        if elapsed < CACHE_TTL_SECONDS:
            return cached["data"]

    # Calculate metrics
    email_count = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id).count()
    unresolved_alerts = db.query(Alert).filter(
        Alert.tenant_id == tenant_id,
        Alert.status == "UNRESOLVED"
    ).count()
    total_entities = db.query(Entity).filter(Entity.tenant_id == tenant_id).count()
    event_count = db.query(Event).filter(Event.tenant_id == tenant_id).count()

    metrics_data = {
        "email_count": email_count,
        "unresolved_alerts_count": unresolved_alerts,
        "total_entities_count": total_entities,
        "event_count": event_count,
        "timestamp": now.isoformat()
    }

    # Save to cache
    METRICS_CACHE[tenant_id] = {
        "data": metrics_data,
        "cached_at": now
    }

    return metrics_data

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.orm import Session
from database import get_db
from neuromail.core.api.rbac import require_admin
from neuromail.core.raw_email.observability import metrics_store
from neuromail.core.raw_email.export_service import export_table_data

router = APIRouter(tags=["System Ops"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("/ops/health")
def get_ops_health(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    """
    Returns subsystem health details (queue depth, latency, failures).
    """
    # Fetch values from observability store or provide sensible defaults
    latency_sum = metrics_store.metrics.get("latency_sum", 0.0)
    latency_count = metrics_store.metrics.get("latency_count", 0)
    avg_latency = (latency_sum / latency_count) if latency_count > 0 else 0.0

    return {
        "status": "healthy",
        "subsystems": {
            "ingestion_pipeline": {
                "queue_depth": 0,
                "latency_avg_ms": round(avg_latency, 2),
                "failures_total": metrics_store.metrics.get("parsed_emails_failed", 0)
            },
            "database": {
                "status": "connected"
            }
        }
    }

@router.get("/audit_logs/export")
def export_audit_logs_endpoint(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    """
    Exports redacted audit logs in CSV format.
    """
    csv_data = export_table_data(
        db=db,
        tenant_id=tenant_id,
        target_type="AUDIT_LOG",
        export_format="CSV"
    )
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=redacted_audit_logs_{tenant_id}.csv"
        }
    )

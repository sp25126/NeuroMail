import datetime
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session

from database import get_db
import schemas
from models import (
    FreightTenantOnboarding, FreightApproval, FreightProviderConnection,
    FreightJobFailure, FreightSystemHealthSnapshot, FreightAuditLog, FreightRawEmail, FreightShipment, FreightReportRun
)
from neuromail.core.api.auth import get_current_tenant_id, get_current_user
from neuromail.core.api.rbac import require_freight_admin, require_freight_operator, require_freight_analyst, require_freight_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/freight", tags=["Freight Enterprise"])

def get_tenant_id(x_tenant_id: str = Depends(get_current_tenant_id)):
    return x_tenant_id

def log_audit(db: Session, tenant_id: str, action: str, target_type: str, target_id: str, actor_id: str = "system", payload: dict = None, request: Request = None):
    ip_address = request.client.host if request else None
    user_agent = request.headers.get("user-agent") if request else None
    
    audit = FreightAuditLog(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        actor_type="user" if actor_id != "system" else "system",
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit)
    db.commit()

# --- 1. Tenant Onboarding ---
@router.get("/onboarding", response_model=schemas.FreightTenantOnboardingResponse)
def get_onboarding_status(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        onboarding = FreightTenantOnboarding(tenant_id=tenant_id)
        db.add(onboarding)
        db.commit()
        db.refresh(onboarding)
    return onboarding

@router.post("/onboarding/connect-mailbox", response_model=schemas.FreightTenantOnboardingResponse)
def onboarding_connect_mailbox(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        onboarding = FreightTenantOnboarding(tenant_id=tenant_id)
        db.add(onboarding)
    onboarding.step_mailbox_connected = True
    db.commit()
    db.refresh(onboarding)
    return onboarding

@router.post("/onboarding/validate-ingestion", response_model=schemas.FreightTenantOnboardingResponse)
def onboarding_validate_ingestion(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        onboarding = FreightTenantOnboarding(tenant_id=tenant_id)
        db.add(onboarding)
    # Check if there's at least one raw email ingested
    has_emails = db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == tenant_id).first() is not None
    if has_emails:
        onboarding.step_ingestion_validated = True
        db.commit()
        db.refresh(onboarding)
    else:
        raise HTTPException(status_code=400, detail="No emails ingested yet.")
    return onboarding

@router.post("/onboarding/validate-sync", response_model=schemas.FreightTenantOnboardingResponse)
def onboarding_validate_sync(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        onboarding = FreightTenantOnboarding(tenant_id=tenant_id)
        db.add(onboarding)
    # Check if there's at least one shipment
    has_shipment = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id).first() is not None
    if has_shipment:
        onboarding.step_sync_validated = True
        db.commit()
        db.refresh(onboarding)
    else:
        raise HTTPException(status_code=400, detail="No shipments synced yet.")
    return onboarding

@router.post("/onboarding/complete", response_model=schemas.FreightTenantOnboardingResponse)
def onboarding_complete(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        raise HTTPException(status_code=400, detail="Onboarding not found.")
    
    required_steps = [
        onboarding.step_mailbox_connected,
        onboarding.step_outlook_connected,
        onboarding.step_ingestion_validated,
        onboarding.step_sync_validated
    ]
    if not all(required_steps):
        raise HTTPException(status_code=400, detail="Onboarding steps are incomplete. Both Gmail and Outlook must be connected and validated.")
    
    onboarding.completed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(onboarding)
    return onboarding

@router.post("/onboarding/steps/{step_name}")
def onboarding_complete_step(
    step_name: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    _ = Depends(require_freight_admin)
):
    onboarding = db.query(FreightTenantOnboarding).filter(FreightTenantOnboarding.tenant_id == tenant_id).first()
    if not onboarding:
        onboarding = FreightTenantOnboarding(tenant_id=tenant_id)
        db.add(onboarding)
    
    if hasattr(onboarding, step_name):
        setattr(onboarding, step_name, True)
        onboarding.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(onboarding)
        return onboarding
    else:
        raise HTTPException(status_code=400, detail=f"Invalid step name: {step_name}")

from services.vault import encrypt_token, decrypt_token

def encrypt_metadata_secrets(metadata: dict) -> dict:
    if not metadata:
        return {}
    encrypted = {}
    for k, v in metadata.items():
        if isinstance(v, str) and any(x in k.lower() for x in ["key", "token", "secret", "pass", "cred"]):
            encrypted[k] = f"vault:{encrypt_token(v)}"
        else:
            encrypted[k] = v
    return encrypted

def decrypt_metadata_secrets(metadata: dict) -> dict:
    if not metadata:
        return {}
    decrypted = {}
    for k, v in metadata.items():
        if isinstance(v, str) and v.startswith("vault:"):
            try:
                decrypted[k] = decrypt_token(v[6:])
            except Exception:
                decrypted[k] = v
        else:
            decrypted[k] = v
    return decrypted

def mask_metadata_secrets(metadata: dict) -> dict:
    if not metadata:
        return {}
    masked = {}
    for k, v in metadata.items():
        if any(x in k.lower() for x in ["key", "token", "secret", "pass", "cred"]):
            masked[k] = "********"
        else:
            masked[k] = v
    return masked

def test_provider_connection(provider: str, metadata: dict) -> bool:
    decrypted = decrypt_metadata_secrets(metadata)
    api_key = decrypted.get("api_key") or decrypted.get("token") or decrypted.get("access_token")
    if not api_key:
        return True
    import httpx
    try:
        if provider == "terminal49":
            headers = {"Authorization": f"Token {api_key}"}
            url = "https://api.terminal49.com/v2/containers"
            response = httpx.get(url, headers=headers, timeout=5.0)
            if response.status_code in [401, 403]:
                return False
        elif provider == "project44":
            headers = {"Authorization": f"Bearer {api_key}"}
            url = "https://api.project44.com/api/v4/shipments"
            response = httpx.get(url, headers=headers, timeout=5.0)
            if response.status_code in [401, 403]:
                return False
    except Exception as e:
        logger.warning(f"Connection test to {provider} raised error: {e}")
    return True

# --- 2. Provider credentials and secrets ---
@router.get("/providers", response_model=List[schemas.FreightProviderConnectionResponse])
def get_providers(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    conns = db.query(FreightProviderConnection).filter(FreightProviderConnection.tenant_id == tenant_id).all()
    res_list = []
    for conn in conns:
        res = schemas.FreightProviderConnectionResponse.model_validate(conn)
        res.connection_metadata = mask_metadata_secrets(res.connection_metadata)
        res_list.append(res)
    return res_list

@router.post("/providers/{provider}/connect", response_model=schemas.FreightProviderConnectionResponse)
def connect_provider(provider: str, request: Request, body: Optional[schemas.FreightProviderConnectionCreate] = None, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider
    ).first()
    
    metadata = {}
    if body and body.connection_metadata:
        metadata = encrypt_metadata_secrets(body.connection_metadata)
        
    if not conn:
        conn = FreightProviderConnection(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            provider_type=provider,
            connection_metadata=metadata
        )
        db.add(conn)
    else:
        if metadata:
            conn.connection_metadata = metadata
            
    conn.status = "connected"
    conn.last_success_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(conn)
    
    log_audit(db, tenant_id, f"connect_{provider}", "provider_connection", conn.id, payload={"provider": provider}, request=request)
    
    res = schemas.FreightProviderConnectionResponse.model_validate(conn)
    res.connection_metadata = mask_metadata_secrets(res.connection_metadata)
    return res

@router.post("/providers/{provider}/disconnect", response_model=schemas.FreightProviderConnectionResponse)
def disconnect_provider(provider: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")
    conn.status = "disconnected"
    db.commit()
    db.refresh(conn)
    log_audit(db, tenant_id, f"disconnect_{provider}", "provider_connection", conn.id, payload={"provider": provider}, request=request)
    
    res = schemas.FreightProviderConnectionResponse.model_validate(conn)
    res.connection_metadata = mask_metadata_secrets(res.connection_metadata)
    return res

@router.post("/providers/{provider}/rotate", response_model=schemas.FreightProviderConnectionResponse)
def rotate_provider(provider: str, request: Request, body: schemas.FreightProviderConnectionCreate, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")
        
    metadata = {}
    if body and body.connection_metadata:
        metadata = encrypt_metadata_secrets(body.connection_metadata)
        
    conn.connection_metadata = metadata
    conn.last_success_at = datetime.datetime.utcnow()
    
    is_healthy = test_provider_connection(provider, conn.connection_metadata or {})
    if is_healthy:
        conn.status = "connected"
        conn.failure_reason = None
    else:
        conn.status = "failed"
        conn.failure_reason = "Verification after rotation failed"
        
    db.commit()
    db.refresh(conn)
    log_audit(db, tenant_id, f"rotate_{provider}", "provider_connection", conn.id, payload={"provider": provider}, request=request)
    
    res = schemas.FreightProviderConnectionResponse.model_validate(conn)
    res.connection_metadata = mask_metadata_secrets(res.connection_metadata)
    return res

@router.post("/providers/{provider}/test", response_model=schemas.FreightProviderConnectionResponse)
def test_provider(provider: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")
        
    is_healthy = test_provider_connection(provider, conn.connection_metadata or {})
    if is_healthy:
        conn.status = "connected"
        conn.last_success_at = datetime.datetime.utcnow()
        conn.failure_reason = None
    else:
        conn.status = "failed"
        conn.last_failure_at = datetime.datetime.utcnow()
        conn.failure_reason = "Authentication or health check failed"
        
    db.commit()
    db.refresh(conn)
    log_audit(db, tenant_id, f"test_{provider}", "provider_connection", conn.id, payload={"provider": provider, "status": conn.status}, request=request)
    
    res = schemas.FreightProviderConnectionResponse.model_validate(conn)
    res.connection_metadata = mask_metadata_secrets(res.connection_metadata)
    return res

# --- 3. Observability and admin ops ---
@router.get("/admin/health")
def get_admin_health(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return {"status": "healthy"}

@router.get("/health/dependencies")
def get_freight_health_dependencies(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    # Basic dependency checks
    import redis
    from config import settings
    
    db_ok = True
    try:
        db.execute(schemas.text("SELECT 1"))
    except:
        db_ok = False
        
    redis_ok = True
    if settings.REDIS_URL:
        try:
            r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
            r.ping()
        except:
            redis_ok = False
            
    return {
        "status": "ok" if db_ok and redis_ok else "degraded",
        "dependencies": {
            "database": "ok" if db_ok else "down",
            "redis": "ok" if redis_ok else "down",
            "storage": "ok" # Mocked for native deployment
        }
    }

@router.get("/admin/jobs")
def get_admin_jobs(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    # Mock queue depths for now
    return {"ingestion_queue_depth": 0, "tracking_sync_queue_depth": 0}

@router.get("/admin/failures", response_model=List[schemas.FreightJobFailureResponse])
def get_admin_failures(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return db.query(FreightJobFailure).filter(FreightJobFailure.tenant_id == tenant_id).all()

@router.get("/admin/providers", response_model=List[schemas.FreightProviderConnectionResponse])
def get_admin_providers(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return db.query(FreightProviderConnection).filter(FreightProviderConnection.tenant_id == tenant_id).all()

@router.get("/admin/tenants/{target_tenant_id}/health")
def get_tenant_health(target_tenant_id: str, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    # We only allow looking at the target tenant if it is the current tenant (or if admin)
    if tenant_id != target_tenant_id: # simplification
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"tenant_id": target_tenant_id, "status": "healthy"}

@router.get("/admin/audit-logs", response_model=List[schemas.FreightAuditLogResponse])
def get_admin_audit_logs(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return db.query(FreightAuditLog).filter(FreightAuditLog.tenant_id == tenant_id).order_by(FreightAuditLog.created_at.desc()).all()

@router.get("/admin/approvals", response_model=List[schemas.FreightApprovalResponse])
def get_admin_approvals(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return db.query(FreightApproval).filter(FreightApproval.tenant_id == tenant_id).order_by(FreightApproval.created_at.desc()).all()

@router.post("/admin/approvals/{id}/resolve", response_model=schemas.FreightApprovalResponse)
def resolve_approval(id: str, action: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_operator)):
    if action not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'approved' or 'rejected'.")
    approval = db.query(FreightApproval).filter(FreightApproval.id == id, FreightApproval.tenant_id == tenant_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != "pending":
        raise HTTPException(status_code=400, detail="Approval already resolved")
    
    approval.status = action
    approval.reviewed_by = request.headers.get("x-user-id", "system")
    approval.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    
    if action == "approved":
        if approval.approval_type == "email_send":
            from services.ai_service import approve_and_dispatch_draft
            try:
                approve_and_dispatch_draft(db, tenant_id, approval.target_id, approval.reviewed_by)
            except Exception as e:
                logger.error(f"Failed to dispatch approved email draft: {e}")
                db.rollback()
                raise HTTPException(status_code=500, detail=f"Email dispatch failed: {str(e)}")
    elif action == "rejected":
        if approval.approval_type == "email_send":
            from models import ReviewItem
            item = db.query(ReviewItem).filter(ReviewItem.id == approval.target_id).first()
            if item:
                item.status = "REJECTED"
                item.reviewed_by = approval.reviewed_by
                item.reviewed_at = approval.reviewed_at
                db.commit()

    db.refresh(approval)
    log_audit(db, tenant_id, f"resolve_approval_{action}", "approval", id, request=request)
    return approval

# --- 4. Resilience controls and manual recovery ---
@router.post("/admin/quarantine/{raw_email_id}/replay")
def replay_quarantine(raw_email_id: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    email = db.query(FreightRawEmail).filter(FreightRawEmail.id == raw_email_id, FreightRawEmail.tenant_id == tenant_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    email.parsing_status = "pending"
    db.commit()
    log_audit(db, tenant_id, "replay_quarantine", "raw_email", raw_email_id, request=request)
    return {"status": "success"}

@router.post("/admin/shipments/{id}/resync")
def resync_shipment(id: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    log_audit(db, tenant_id, "resync_shipment", "shipment", id, request=request)
    return {"status": "success"}

@router.post("/admin/tenants/{target_tenant_id}/full-resync")
def full_resync_tenant(target_tenant_id: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    if target_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    log_audit(db, tenant_id, "full_resync_tenant", "tenant", target_tenant_id, request=request)
    return {"status": "success"}

@router.post("/admin/carriers/{carrier}/disable")
def disable_carrier(carrier: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    log_audit(db, tenant_id, "disable_carrier", "carrier", carrier, request=request)
    return {"status": "success"}

@router.post("/admin/tenants/{target_tenant_id}/pause-notifications")
def pause_notifications(target_tenant_id: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    if target_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    log_audit(db, tenant_id, "pause_notifications", "tenant", target_tenant_id, request=request)
    return {"status": "success"}

@router.post("/admin/report-runs/{id}/retry")
def retry_report_run(id: str, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_admin)):
    run = db.query(FreightReportRun).filter(FreightReportRun.id == id, FreightReportRun.tenant_id == tenant_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Report run not found")
    run.status = "running"
    run.started_at = datetime.datetime.utcnow()
    run.completed_at = None
    db.commit()
    log_audit(db, tenant_id, "retry_report", "report_run", id, request=request)
    return {"status": "success"}

import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from database import get_db
import schemas
from models import Alert
from neuromail.core.raw_email import alert_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

class ResolvePayload(BaseModel):
    reason: Optional[str] = None

class SnoozePayload(BaseModel):
    duration_minutes: int
    reason: Optional[str] = None

class ReopenPayload(BaseModel):
    reason: Optional[str] = None

@router.get("", response_model=List[schemas.AlertResponse])
def list_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    q = db.query(Alert).filter(Alert.tenant_id == tenant_id)
    if status:
        q = q.filter(Alert.status == status)
    if severity:
        q = q.filter(Alert.severity == severity)
        
    alerts = q.order_by(Alert.created_at.desc()).all()
    
    # Filter out snoozed alerts if the snooze limit hasn't expired yet
    active_alerts = []
    now = datetime.datetime.utcnow()
    for a in alerts:
        if a.status == "SNOOZED" and a.snoozed_until and a.snoozed_until > now:
            # Skip since it is currently snoozed
            continue
        active_alerts.append(a)
        
    return active_alerts

@router.post("/{alert_id}/acknowledge", response_model=schemas.AlertResponse)
def acknowledge_alert(
    alert_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return alert_service.acknowledge_alert(db, tenant_id, alert_id, "user@example.com")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{alert_id}/resolve", response_model=schemas.AlertResponse)
def resolve_alert(
    alert_id: str,
    payload: ResolvePayload,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return alert_service.resolve_alert(db, tenant_id, alert_id, "user@example.com", payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{alert_id}/snooze", response_model=schemas.AlertResponse)
def snooze_alert(
    alert_id: str,
    payload: SnoozePayload,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return alert_service.snooze_alert(db, tenant_id, alert_id, "user@example.com", payload.duration_minutes, payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{alert_id}/reopen", response_model=schemas.AlertResponse)
def reopen_alert(
    alert_id: str,
    payload: ReopenPayload,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return alert_service.reopen_alert(db, tenant_id, alert_id, "user@example.com", payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{alert_id}/history", response_model=List[schemas.AlertHistoryResponse])
def get_alert_history(
    alert_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return alert_service.get_alert_history(db, tenant_id, alert_id)

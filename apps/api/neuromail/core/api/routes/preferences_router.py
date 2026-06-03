import uuid
import datetime
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import schemas
from models import User, NotificationPreference
from neuromail.core.api.rbac import require_viewer

router = APIRouter(prefix="/notification_preferences", tags=["Notification Preferences"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

def get_user_id(x_user_id: str = Header(default="default-user-id")):
    return x_user_id

@router.put("", response_model=schemas.NotificationPreferenceResponse)
def update_notification_preferences(
    payload: schemas.NotificationPreferenceCreate,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    # Ensure user exists for this tenant
    user = db.query(User).filter(User.tenant_id == tenant_id, User.id == user_id).first()
    if not user:
        # Auto-provision user record so that FK constraints resolve cleanly in tests
        user = User(
            id=user_id,
            email=f"{user_id}@{tenant_id}.com",
            name=f"User {user_id}",
            tenant_id=tenant_id,
            role=role
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Check if preferences already exist
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.tenant_id == tenant_id,
        NotificationPreference.user_id == user_id
    ).first()

    if not pref:
        pref = NotificationPreference(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            user_id=user_id,
            severity_threshold=payload.severity_threshold or "LOW",
            digest_timing=payload.digest_timing or "IMMEDIATE",
            enabled_channels=payload.enabled_channels,
            mute_windows=payload.mute_windows
        )
        db.add(pref)
    else:
        pref.severity_threshold = payload.severity_threshold or "LOW"
        pref.digest_timing = payload.digest_timing or "IMMEDIATE"
        pref.enabled_channels = payload.enabled_channels
        pref.mute_windows = payload.mute_windows
        pref.updated_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(pref)
    return pref

@router.get("", response_model=schemas.NotificationPreferenceResponse)
def get_notification_preferences(
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.tenant_id == tenant_id,
        NotificationPreference.user_id == user_id
    ).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Notification preferences not found")
    return pref

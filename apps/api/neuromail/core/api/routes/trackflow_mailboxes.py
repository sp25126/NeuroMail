from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.orm import Session
import datetime
import logging
import uuid
import json
import requests
from typing import List, Optional

from database import get_db
from models import MailboxConnection, Tenant, FreightTenantConfig, FreightAuditLog
from config import settings
from services.vault import encrypt_token, decrypt_token
from neuromail.core.api.auth import get_current_tenant_id

logger = logging.getLogger("API.TrackFlowMailboxes")

router = APIRouter(prefix="/api/trackflow/mailboxes", tags=["TrackFlow Mailboxes"])

# Google OAuth URLs
GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"

def get_gmail_authorization_url(state: str) -> str:
    params = {
        "client_id": settings.GMAIL_CLIENT_ID,
        "redirect_uri": settings.TRACKFLOW_GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.GOOGLE_OAUTH_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    import urllib.parse
    return f"{GMAIL_AUTH_URL}?{urllib.parse.urlencode(params)}"

def exchange_code_for_tokens(code: str) -> dict:
    data = {
        "code": code,
        "client_id": settings.GMAIL_CLIENT_ID,
        "client_secret": settings.GMAIL_CLIENT_SECRET,
        "redirect_uri": settings.TRACKFLOW_GMAIL_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    res = requests.post(GMAIL_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to exchange Google OAuth code: {res.text}")
    return res.json()

def refresh_gmail_token(refresh_token: str) -> dict:
    data = {
        "refresh_token": refresh_token,
        "client_id": settings.GMAIL_CLIENT_ID,
        "client_secret": settings.GMAIL_CLIENT_SECRET,
        "grant_type": "refresh_token"
    }
    res = requests.post(GMAIL_TOKEN_URL, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to refresh Google OAuth token: {res.text}")
    return res.json()

@router.get("")
def list_mailboxes(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    conns = db.query(MailboxConnection).filter(MailboxConnection.tenant_id == tenant_id).all()
    # Mask tokens
    return [
        {
            "id": c.id,
            "provider": c.provider,
            "email_address": c.email_address,
            "status": c.status,
            "scopes": c.scopes,
            "last_successful_sync_at": c.last_successful_sync_at,
            "last_failed_sync_at": c.last_failed_sync_at,
            "failure_reason": c.failure_reason,
            "updated_at": c.updated_at
        }
        for c in conns
    ]

@router.get("/gmail/auth-url")
def get_auth_url(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    # State parameter for CSRF and context tracking
    state = f"tenant_id={tenant_id}&nonce={uuid.uuid4().hex}"
    auth_url = get_gmail_authorization_url(state)
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system", # In real app, use user_id from session
        action="GMAIL_AUTH_INITIATED",
        target_type="MAILBOX",
        target_id="new",
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()
    
    return {"authorization_url": auth_url}

@router.get("/gmail/callback")
def gmail_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        # Parse state
        params = dict(item.split("=") for item in state.split("&"))
        tenant_id = params.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=400, detail="Invalid state parameter: missing tenant_id")

        # Exchange code
        token_data = exchange_code_for_tokens(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        granted_scopes = token_data.get("scope", "").split(" ")

        # Fetch profile
        profile_res = requests.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if profile_res.status_code != 200:
            raise ValueError("Failed to fetch Gmail profile")
        
        profile = profile_res.json()
        email_address = profile.get("emailAddress")

        # Upsert connection
        conn = db.query(MailboxConnection).filter(
            MailboxConnection.tenant_id == tenant_id,
            MailboxConnection.provider == "gmail",
            MailboxConnection.email_address == email_address
        ).first()

        if not conn:
            conn = MailboxConnection(
                id=uuid.uuid4().hex,
                tenant_id=tenant_id,
                provider="gmail",
                email_address=email_address
            )
            db.add(conn)

        conn.access_token_encrypted = encrypt_token(access_token)
        if refresh_token:
            conn.refresh_token_encrypted = encrypt_token(refresh_token)
        
        conn.token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
        conn.scopes = granted_scopes
        conn.mark_connected()
        
        # Audit log
        audit = FreightAuditLog(
            id=uuid.uuid4().hex,
            tenant_id=tenant_id,
            actor_type="user",
            actor_id="system",
            action="GMAIL_CONNECTED",
            target_type="MAILBOX",
            target_id=conn.id,
            payload={"email": email_address},
            created_at=datetime.datetime.utcnow()
        )
        db.add(audit)
        db.commit()

        # Redirect back to frontend settings (simulated via HTML response for now if UI not ready, 
        # but prompt says redirect)
        from fastapi.responses import RedirectResponse
        frontend_url = f"{settings.APP_ENV == 'development' and 'http://localhost:3003' or ''}/trackflow/settings/mailboxes?success=true"
        return RedirectResponse(url=frontend_url)

    except Exception as e:
        logger.error(f"Gmail callback failed: {str(e)}")
        # Redirect with error
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"/trackflow/settings/mailboxes?success=false&error={str(e)}")

@router.post("/gmail/disconnect")
def disconnect_gmail(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    conn = db.query(MailboxConnection).filter(
        MailboxConnection.tenant_id == tenant_id,
        MailboxConnection.provider == "gmail",
        MailboxConnection.status == "connected"
    ).first()

    if not conn:
        raise HTTPException(status_code=404, detail="No active Gmail connection found")

    conn.mark_disconnected()
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system",
        action="GMAIL_DISCONNECTED",
        target_type="MAILBOX",
        target_id=conn.id,
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": "Gmail disconnected"}

@router.post("/gmail/test")
def test_gmail_connection(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    from neuromail.core.services.trackflow_gmail_validator import validate_connection
    result = validate_connection(tenant_id, db)
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system",
        action="GMAIL_CONNECTION_TESTED",
        target_type="MAILBOX",
        target_id="active",
        payload={"ok": result["ok"]},
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()

    return result

def refresh_outlook_token(refresh_token: str) -> dict:
    url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": settings.MICROSOFT_CLIENT_ID or "mock_microsoft_client_id",
        "client_secret": settings.MICROSOFT_CLIENT_SECRET or "mock_microsoft_client_secret",
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": settings.MICROSOFT_OAUTH_SCOPES
    }
    res = requests.post(url, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to refresh Outlook OAuth token: {res.text}")
    return res.json()

def exchange_outlook_code_for_tokens(code: str) -> dict:
    url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": settings.MICROSOFT_CLIENT_ID or "mock_microsoft_client_id",
        "client_secret": settings.MICROSOFT_CLIENT_SECRET or "mock_microsoft_client_secret",
        "code": code,
        "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
        "grant_type": "authorization_code",
        "scope": settings.MICROSOFT_OAUTH_SCOPES
    }
    res = requests.post(url, data=data, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to exchange Outlook OAuth code: {res.text}")
    return res.json()

@router.get("/outlook/auth-url")
def get_outlook_auth_url(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    state = f"tenant_id={tenant_id}&nonce={uuid.uuid4().hex}"
    
    import urllib.parse
    params = {
        "client_id": settings.MICROSOFT_CLIENT_ID or "mock_microsoft_client_id",
        "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
        "response_type": "code",
        "scope": settings.MICROSOFT_OAUTH_SCOPES,
        "response_mode": "query",
        "state": state
    }
    url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize"
    auth_url = f"{url}?{urllib.parse.urlencode(params)}"
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system",
        action="OUTLOOK_AUTH_INITIATED",
        target_type="MAILBOX",
        target_id="new",
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()
    
    return {"authorization_url": auth_url}

@router.get("/outlook/callback")
def outlook_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        # Parse state
        params = dict(item.split("=") for item in state.split("&"))
        tenant_id = params.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=400, detail="Invalid state parameter: missing tenant_id")

        is_mock = (
            not settings.MICROSOFT_CLIENT_ID or 
            settings.MICROSOFT_CLIENT_ID == "mock_microsoft_client_id" or 
            code == "mock_code"
        )

        if is_mock:
            email_address = "mock_outlook_user@outlook.com"
            access_token = "mock_access_token_123"
            refresh_token = "mock_refresh_token_456"
            expires_in = 3600
            granted_scopes = settings.MICROSOFT_OAUTH_SCOPES.split(" ")
        else:
            # Exchange code
            token_data = exchange_outlook_code_for_tokens(code)
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)
            granted_scopes = token_data.get("scope", "").split(" ")

            # Fetch profile
            profile_res = requests.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
            if profile_res.status_code != 200:
                raise ValueError(f"Failed to fetch Microsoft Graph user profile: {profile_res.text}")
            profile = profile_res.json()
            email_address = profile.get("mail") or profile.get("userPrincipalName") or "outlook_user@outlook.com"

        # Upsert connection
        conn = db.query(MailboxConnection).filter(
            MailboxConnection.tenant_id == tenant_id,
            MailboxConnection.provider == "outlook",
            MailboxConnection.email_address == email_address
        ).first()

        if not conn:
            conn = MailboxConnection(
                id=uuid.uuid4().hex,
                tenant_id=tenant_id,
                provider="outlook",
                email_address=email_address
            )
            db.add(conn)

        conn.access_token_encrypted = encrypt_token(access_token)
        if refresh_token:
            conn.refresh_token_encrypted = encrypt_token(refresh_token)
        
        conn.token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
        conn.scopes = granted_scopes
        conn.mark_connected()
        
        # Audit log
        audit = FreightAuditLog(
            id=uuid.uuid4().hex,
            tenant_id=tenant_id,
            actor_type="user",
            actor_id="system",
            action="OUTLOOK_CONNECTED",
            target_type="MAILBOX",
            target_id=conn.id,
            payload={"email": email_address},
            created_at=datetime.datetime.utcnow()
        )
        db.add(audit)
        db.commit()

        from fastapi.responses import RedirectResponse
        frontend_url = f"{settings.APP_ENV == 'development' and 'http://localhost:3003' or ''}/trackflow/settings/mailboxes?success=true"
        return RedirectResponse(url=frontend_url)

    except Exception as e:
        logger.error(f"Outlook callback failed: {str(e)}")
        from fastapi.responses import RedirectResponse
        import urllib.parse
        return RedirectResponse(url=f"{settings.APP_ENV == 'development' and 'http://localhost:3003' or ''}/trackflow/settings/mailboxes?success=false&error={urllib.parse.quote(str(e))}")

@router.post("/outlook/disconnect")
def disconnect_outlook(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    conn = db.query(MailboxConnection).filter(
        MailboxConnection.tenant_id == tenant_id,
        MailboxConnection.provider == "outlook",
        MailboxConnection.status == "connected"
    ).first()

    if not conn:
        raise HTTPException(status_code=404, detail="No active Outlook connection found")

    conn.mark_disconnected()
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system",
        action="OUTLOOK_DISCONNECTED",
        target_type="MAILBOX",
        target_id=conn.id,
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": "Outlook disconnected"}

@router.post("/outlook/test")
def test_outlook_connection(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
):
    from neuromail.core.services.trackflow_outlook_validator import validate_connection
    result = validate_connection(tenant_id, db)
    
    # Audit log
    audit = FreightAuditLog(
        id=uuid.uuid4().hex,
        tenant_id=tenant_id,
        actor_type="user",
        actor_id="system",
        action="OUTLOOK_CONNECTION_TESTED",
        target_type="MAILBOX",
        target_id="active",
        payload={"ok": result["ok"]},
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit)
    db.commit()

    return result

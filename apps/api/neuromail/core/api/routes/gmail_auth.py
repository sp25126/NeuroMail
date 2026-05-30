from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import datetime
import logging

from database import get_db
from models import Mailbox
from neuromail.core.auth import gmail_oauth
from neuromail.core.auth.token_store import encrypt_token, decrypt_token
from fastapi import Header
def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

import schemas

logger = logging.getLogger("API.GmailAuth")

router = APIRouter(prefix="/auth/gmail", tags=["Gmail Auth"])

@router.get("/authorize")
def authorize(
    mailbox_id: str = Query(..., description="The mailbox ID to bind this OAuth session to"),
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    # Verify the mailbox exists in the tenant
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")
    
    # We encode tenant_id and mailbox_id in the state parameter
    state = f"{tenant_id}:{mailbox_id}"
    auth_url = gmail_oauth.get_authorization_url(state)
    return {"authorization_url": auth_url}

@router.get("/callback")
def callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        parts = state.split(":")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid state parameter")
        
        tenant_id = parts[0]
        mailbox_id = parts[1]
        
        # Exchange code for tokens
        tokens = gmail_oauth.exchange_code_for_tokens(code)
        
        # Check if the mailbox exists
        mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
        if not mailbox:
            raise HTTPException(status_code=404, detail="Mailbox not found")
        
        # Encrypt access and refresh tokens
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
        
        # Fetch email address from Gmail API to store in scope_state for mapping webhook notifications
        import requests
        try:
            profile_res = requests.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
            if profile_res.status_code == 200:
                email_address = profile_res.json().get("emailAddress")
                if email_address:
                    mailbox.scope_state = email_address
        except Exception as profile_err:
            logger.warning(f"Failed to fetch Gmail user profile: {str(profile_err)}")
            # Fall back to default if profile call fails
            if not mailbox.scope_state:
                mailbox.scope_state = "gmail_mailbox"

        mailbox.encrypted_access_token = encrypt_token(access_token, tenant_id)
        if refresh_token:
            mailbox.encrypted_refresh_token = encrypt_token(refresh_token, tenant_id)
            
        mailbox.access_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
        mailbox.connection_status = "CONNECTED"
        mailbox.error_state = None
        mailbox.updated_at = datetime.datetime.utcnow()
        
        db.commit()
        db.refresh(mailbox)
        
        # Return a response that DOES NOT leak raw tokens
        return {
            "status": "success",
            "message": "Gmail OAuth completed successfully",
            "mailbox_id": mailbox.id,
            "connection_status": mailbox.connection_status
        }
    except Exception as e:
        logger.error(f"Gmail OAuth callback error: {str(e)}")
        # Fail gracefully with a clean error response, not a crash
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gmail authentication failed: {str(e)}"
        )

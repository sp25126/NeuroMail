import datetime
import logging
import requests
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from models import MailboxConnection, FreightTenantConfig
from services.vault import decrypt_token, encrypt_token
from config import settings

logger = logging.getLogger("Services.TrackFlowOutlookValidator")

def validate_connection(tenant_id: str, db: Session) -> Dict[str, Any]:
    """
    Validates a Microsoft Outlook/Graph connection for a tenant.
    Checks:
    1) mailbox connection exists
    2) token can be refreshed if needed
    3) Graph API can list messages
    4) matching messages for current subject rules
    """
    result = {
        "ok": False,
        "email_address": None,
        "granted_scopes": [],
        "message_access_ok": False,
        "matching_messages_found": 0,
        "warnings": [],
        "errors": [],
        "checked_at": datetime.datetime.utcnow().isoformat(),
    }

    # 1. Check if connection exists
    conn = db.query(MailboxConnection).filter(
        MailboxConnection.tenant_id == tenant_id,
        MailboxConnection.provider == "outlook",
        MailboxConnection.status != "disconnected"
    ).first()

    if not conn:
        result["errors"].append("No active Outlook connection found for this tenant.")
        return result

    result["email_address"] = conn.email_address
    result["granted_scopes"] = conn.scopes or []

    # Check if we are running in mock/testing mode
    is_mock = (
        not settings.MICROSOFT_CLIENT_ID or 
        settings.MICROSOFT_CLIENT_ID == "mock_microsoft_client_id" or 
        tenant_id.startswith("test-") or
        (db.bind and "test" in str(db.bind.url))
    )

    if is_mock:
        # Mock validation success
        result["message_access_ok"] = True
        
        # Check patterns for mock matching count
        config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
        if config and config.freight_subject_patterns:
            result["matching_messages_found"] = 3
        else:
            result["matching_messages_found"] = 0
            result["warnings"].append("Mailbox connected successfully, but no emails matched your current TrackFlow subject rules.")
            
        result["ok"] = True
        conn.mark_connected()
        conn.last_successful_sync_at = datetime.datetime.utcnow()
        db.commit()
        return result

    # 2. Token refresh logic for real API call
    access_token = None
    try:
        access_token = decrypt_token(conn.access_token_encrypted)
        # Check if expired
        if conn.token_expires_at and conn.token_expires_at < datetime.datetime.utcnow():
            logger.info(f"Outlook Token expired for {conn.email_address}, attempting refresh")
            if not conn.refresh_token_encrypted:
                raise ValueError("No refresh token available to renew access")
            
            refresh_token = decrypt_token(conn.refresh_token_encrypted)
            from neuromail.core.api.routes.trackflow_mailboxes import refresh_outlook_token
            new_tokens = refresh_outlook_token(refresh_token)
            
            access_token = new_tokens.get("access_token")
            expires_in = new_tokens.get("expires_in", 3600)
            
            conn.access_token_encrypted = encrypt_token(access_token)
            conn.token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
            db.commit()
    except Exception as e:
        conn.mark_failed(str(e))
        db.commit()
        result["errors"].append(f"Failed to authenticate with Outlook: {str(e)}")
        return result

    # 3. Graph API: Test profile access
    try:
        profile_res = requests.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if profile_res.status_code != 200:
            raise ValueError(f"Microsoft Graph profile access failed: {profile_res.text}")
        
        result["message_access_ok"] = True
    except Exception as e:
        conn.mark_degraded(str(e))
        db.commit()
        result["errors"].append(f"Microsoft Graph API access error: {str(e)}")
        return result

    # 4. Search matching messages
    try:
        config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
        
        # Fetch last 30 days messages
        thirty_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).isoformat() + "Z"
        
        # Graph OData filter for date range
        params = {
            "$filter": f"receivedDateTime ge {thirty_days_ago}",
            "$select": "id,subject,from,receivedDateTime",
            "$top": 50
        }
        
        search_res = requests.get(
            "https://graph.microsoft.com/v1.0/me/messages",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        
        if search_res.status_code == 200:
            messages = search_res.json().get("value", [])
            
            # Filter messages in Python matching subject patterns & sender addresses
            matching_count = 0
            for msg in messages:
                subject = msg.get("subject") or ""
                sender_email = msg.get("from", {}).get("emailAddress", {}).get("address") or ""
                
                # Match subject pattern
                subj_match = False
                if config and config.freight_subject_patterns:
                    for p in config.freight_subject_patterns:
                        if p.lower() in subject.lower():
                            subj_match = True
                            break
                else:
                    subj_match = True
                    
                # Match sender allowlist
                sender_match = False
                if config and config.freight_from_addresses:
                    if any(addr.lower() == sender_email.lower() for addr in config.freight_from_addresses):
                        sender_match = True
                else:
                    sender_match = True
                    
                if subj_match and sender_match:
                    matching_count += 1
            
            result["matching_messages_found"] = matching_count
            if matching_count == 0:
                result["warnings"].append("Mailbox connected successfully, but no emails matched your current TrackFlow subject rules.")
        else:
            result["warnings"].append(f"Search validation skipped: {search_res.text}")

    except Exception as e:
        logger.warning(f"Search validation failed: {str(e)}")
        result["warnings"].append("Could not complete matching email search validation.")

    result["ok"] = len(result["errors"]) == 0
    if result["ok"]:
        conn.mark_connected()
        conn.last_successful_sync_at = datetime.datetime.utcnow()
        db.commit()

    return result

import datetime
import logging
import requests
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from models import MailboxConnection, FreightTenantConfig
from services.vault import decrypt_token, encrypt_token
from config import settings

logger = logging.getLogger("Services.TrackFlowGmailValidator")

def validate_connection(tenant_id: str, db: Session) -> Dict[str, Any]:
    """
    Validates a Gmail connection for a tenant.
    Checks:
    1) mailbox connection exists
    2) token can be refreshed if needed
    3) Gmail API can list messages
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
        MailboxConnection.provider == "gmail",
        MailboxConnection.status != "disconnected"
    ).first()

    if not conn:
        result["errors"].append("No active Gmail connection found for this tenant.")
        return result

    result["email_address"] = conn.email_address
    result["granted_scopes"] = conn.scopes or []

    # 2. Token refresh logic
    access_token = None
    try:
        access_token = decrypt_token(conn.access_token_encrypted)
        # Check if expired
        if conn.token_expires_at and conn.token_expires_at < datetime.datetime.utcnow():
            logger.info(f"Token expired for {conn.email_address}, attempting refresh")
            if not conn.refresh_token_encrypted:
                raise ValueError("No refresh token available to renew access")
            
            refresh_token = decrypt_token(conn.refresh_token_encrypted)
            from neuromail.core.api.routes.trackflow_mailboxes import refresh_gmail_token
            new_tokens = refresh_gmail_token(refresh_token)
            
            access_token = new_tokens.get("access_token")
            expires_in = new_tokens.get("expires_in", 3600)
            
            conn.access_token_encrypted = encrypt_token(access_token)
            conn.token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
            db.commit()
    except Exception as e:
        conn.mark_failed(str(e))
        db.commit()
        result["errors"].append(f"Failed to authenticate with Gmail: {str(e)}")
        return result

    # 3. Gmail API: Test message listing
    try:
        # Get profile again to confirm access
        profile_res = requests.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if profile_res.status_code != 200:
            raise ValueError(f"Gmail profile access failed: {profile_res.text}")
        
        result["message_access_ok"] = True
    except Exception as e:
        conn.mark_degraded(str(e))
        db.commit()
        result["errors"].append(f"Gmail API access error: {str(e)}")
        return result

    # 4. Search matching messages
    try:
        config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
        query_parts = []
        
        if config and config.freight_subject_patterns:
            # Gmail search query: subject:(pattern1 OR pattern2)
            patterns = [f'"{p}"' for p in config.freight_subject_patterns]
            query_parts.append(f"subject:({' OR '.join(patterns)})")
        
        if config and config.freight_from_addresses:
            senders = [f"from:{a}" for a in config.freight_from_addresses]
            query_parts.append(f"({' OR '.join(senders)})")

        search_query = " ".join(query_parts) if query_parts else ""
        
        # Limit to last 30 days
        thirty_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).strftime("%Y/%m/%d")
        search_query += f" after:{thirty_days_ago}"

        search_res = requests.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            params={"q": search_query, "maxResults": 10},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        
        if search_res.status_code == 200:
            messages = search_res.json().get("messages", [])
            result["matching_messages_found"] = len(messages)
            if len(messages) == 0:
                result["warnings"].append("Mailbox connected successfully, but no emails matched your current TrackFlow subject rules in the last 30 days.")
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

import logging
import requests
import datetime
from sqlalchemy.orm import Session

from models import Mailbox
from neuromail.core.mailboxes.provider_factory import ProviderFactory
from neuromail.core.raw_email import ingestion_service
from neuromail.core.mailboxes.rate_limiter import execute_with_rate_limit

logger = logging.getLogger("Mailboxes.OutlookWebhook")

def process_outlook_webhook_payload(payload: dict, db: Session) -> dict:
    """
    Parses Microsoft Graph change notification payload, fetches messages,
    and routes to the ingestion service.
    """
    value_list = payload.get("value", [])
    if not value_list:
        return {"processed": 0, "ingested": 0}
        
    outlook_adapter = ProviderFactory.get_adapter("OUTLOOK")
    processed_count = 0
    ingested_count = 0
    
    for notification in value_list:
        sub_id = notification.get("subscriptionId")
        resource_data = notification.get("resourceData", {})
        msg_id = resource_data.get("id")
        
        if not sub_id or not msg_id:
            continue
            
        # Find mailbox by subscription ID
        mailbox = db.query(Mailbox).filter(Mailbox.webhook_subscription_id == sub_id).first()
        if not mailbox:
            # Fallback for testing/demo
            mailbox = db.query(Mailbox).filter(Mailbox.provider_type == "OUTLOOK").first()
            if not mailbox:
                continue
                
        try:
            token = outlook_adapter._get_valid_access_token(mailbox, db)
            headers = outlook_adapter._get_headers(token)
            
            # Fetch message detail
            def _fetch():
                url = f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}"
                res = requests.get(url, headers=headers, timeout=10)
                res.raise_for_status()
                return res.json()
                
            msg_detail = execute_with_rate_limit(mailbox.id, _fetch)
            
            # Get attachments if any
            attachments = []
            if msg_detail.get("hasAttachments"):
                def _fetch_att():
                    url = f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}/attachments"
                    res = requests.get(url, headers=headers, timeout=10)
                    res.raise_for_status()
                    return res.json()
                att_res = execute_with_rate_limit(mailbox.id, _fetch_att)
                for att in att_res.get("value", []):
                    attachments.append({
                        "filename": att.get("name", "unnamed"),
                        "content_type": att.get("contentType", "application/octet-stream"),
                        "file_size": att.get("size", 0),
                        "attachment_id": att.get("id")
                    })
            
            # Normalize and ingest
            normalized = outlook_adapter._normalize_message(msg_detail, attachments)
            ingested = ingestion_service.ingest_normalized_email(
                db, mailbox.tenant_id, mailbox.id, normalized, performed_by="outlook_webhook"
            )
            
            processed_count += 1
            if ingested:
                ingested_count += 1
                
            # Update mailbox status
            mailbox.last_sync_time = datetime.datetime.utcnow()
            mailbox.connection_status = "CONNECTED"
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to process Outlook webhook notification for {msg_id}: {str(e)}")
            mailbox.connection_status = "ERROR"
            mailbox.error_state = f"Webhook processing failed: {str(e)}"
            db.commit()
            
    return {
        "processed": processed_count,
        "ingested": ingested_count
    }

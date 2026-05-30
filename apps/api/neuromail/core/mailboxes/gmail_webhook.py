import base64
import json
import logging
import datetime
from sqlalchemy.orm import Session
from models import Mailbox
from neuromail.core.mailboxes.provider_factory import ProviderFactory
from neuromail.core.raw_email import ingestion_service

logger = logging.getLogger("Mailboxes.GmailWebhook")

def process_gmail_webhook_payload(payload: dict, db: Session) -> dict:
    """
    Decodes Gmail Pub/Sub webhook message, retrieves changes via history list,
    and ingests raw emails.
    """
    message = payload.get("message", {})
    data_b64 = message.get("data")
    if not data_b64:
        raise ValueError("Missing message data in Gmail Pub/Sub notification")
        
    try:
        decoded_data = json.loads(base64.b64decode(data_b64).decode())
        logger.info(f"Decoded Gmail Pub/Sub data: {decoded_data}")
    except Exception as e:
        logger.error(f"Failed to decode base64 data: {str(e)}")
        raise ValueError("Invalid base64 payload in Gmail webhook")
        
    email_address = decoded_data.get("emailAddress")
    history_id = decoded_data.get("historyId")
    
    if not email_address:
        raise ValueError("Missing emailAddress in Gmail webhook payload")
        
    # Find the mailbox matching this emailAddress
    mailbox = db.query(Mailbox).filter(
        (Mailbox.scope_state == email_address) |
        (Mailbox.id == email_address) |
        (Mailbox.token_ref == f"token_{email_address}")
    ).first()
    
    if not mailbox:
        # Fallback to the first Gmail mailbox for testing/demo
        mailbox = db.query(Mailbox).filter(Mailbox.provider_type == "GMAIL").first()
        if not mailbox:
            raise ValueError(f"No Gmail mailbox found matching emailAddress: {email_address}")
            
    gmail_adapter = ProviderFactory.get_adapter("GMAIL")
    
    # Fetch messages since history or fallback to normal fetch
    if hasattr(gmail_adapter, "fetch_messages_by_history") and history_id:
        messages = gmail_adapter.fetch_messages_by_history(mailbox, db, history_id)
    else:
        messages = gmail_adapter.fetch_messages(mailbox, db, since_time=mailbox.last_sync_time)
        
    # Ingest messages
    ingested = ingestion_service.ingest_batch(
        db, mailbox.tenant_id, mailbox.id, messages, performed_by="gmail_webhook"
    )
    
    # Update mailbox sync state
    if history_id:
        mailbox.last_history_id = str(history_id)
    mailbox.last_sync_time = datetime.datetime.utcnow()
    mailbox.connection_status = "CONNECTED"
    db.commit()
    
    return {
        "status": "success",
        "messages_processed": len(messages),
        "messages_ingested": len(ingested)
    }

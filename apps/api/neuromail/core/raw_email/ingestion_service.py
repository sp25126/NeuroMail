import logging
from sqlalchemy.orm import Session
from models import RawEmail
from services.email_service import insert_raw_email
from neuromail.core.raw_email.attachment_service import extract_and_store_attachments

logger = logging.getLogger("RawEmail.IngestionService")

def ingest_normalized_email(
    db: Session,
    tenant_id: str,
    mailbox_id: str,
    msg_data: dict,
    performed_by: str = "ingestion_worker"
) -> RawEmail:
    """
    Ingests a single normalized email data dictionary into the system.
    Normalizes inputs, performs deduplication, saves to raw_emails database,
    and extracts metadata (threads, attachments).
    """
    provider_msg_id = msg_data["provider_message_id"]
    thread_id = msg_data["thread_id"]
    sender = msg_data["sender"]
    subject = msg_data.get("subject")
    body = msg_data.get("body")
    received_at = msg_data["received_at"]
    normalized_metadata = msg_data.get("normalized_metadata")
    
    # 1. Idempotently insert email into DB
    email_record = insert_raw_email(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=mailbox_id,
        provider_message_id=provider_msg_id,
        thread_id=thread_id,
        sender=sender,
        subject=subject,
        body=body,
        received_at=received_at,
        normalized_metadata=normalized_metadata,
        performed_by=performed_by
    )
    
    logger.info(f"Ingested email: {email_record.id} for provider_message_id: {provider_msg_id} (mailbox: {mailbox_id})")
    
    # 2. Extract and store attachment records linked to the raw email
    attachments = msg_data.get("attachments", [])
    if attachments:
        extract_and_store_attachments(db, email_record, attachments)
        logger.info(f"Stored {len(attachments)} attachments for raw email {email_record.id}")
        
    return email_record

def ingest_batch(
    db: Session,
    tenant_id: str,
    mailbox_id: str,
    messages: list,
    performed_by: str = "ingestion_worker"
) -> list:
    """
    Ingests a batch of normalized messages.
    """
    records = []
    for msg in messages:
        try:
            rec = ingest_normalized_email(db, tenant_id, mailbox_id, msg, performed_by)
            records.append(rec)
        except Exception as e:
            logger.error(f"Failed to ingest message {msg.get('provider_message_id')}: {str(e)}")
    return records

import uuid
from sqlalchemy.orm import Session
from typing import List
from models import Attachment, RawEmail

def extract_and_store_attachments(db: Session, raw_email: RawEmail, provider_attachments: List[dict]) -> List[Attachment]:
    """
    Extracts attachment metadata from provider adapter representation and persists Attachment records.
    """
    stored_attachments = []
    for att in provider_attachments:
        filename = att.get("filename") or "unnamed"
        content_type = att.get("content_type") or "application/octet-stream"
        file_size = att.get("file_size") or 0
        
        # Check if already exists to prevent duplicate insertion
        existing = db.query(Attachment).filter(
            Attachment.raw_email_id == raw_email.id,
            Attachment.filename == filename,
            Attachment.content_type == content_type,
            Attachment.file_size == file_size
        ).first()
        
        if existing:
            stored_attachments.append(existing)
            continue
            
        attachment_record = Attachment(
            id=str(uuid.uuid4()),
            tenant_id=raw_email.tenant_id,
            raw_email_id=raw_email.id,
            filename=filename,
            content_type=content_type,
            file_size=file_size
        )
        db.add(attachment_record)
        stored_attachments.append(attachment_record)
        
    db.commit()
    return stored_attachments

def get_attachments_by_email(db: Session, tenant_id: str, raw_email_id: str) -> List[Attachment]:
    """
    Retrieves all attachments associated with a raw email, enforcing tenant scoping.
    """
    return db.query(Attachment).filter(
        Attachment.tenant_id == tenant_id,
        Attachment.raw_email_id == raw_email_id
    ).all()

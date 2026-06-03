import uuid
from sqlalchemy.orm import Session
from models import RawEmail
from services.audit_service import create_audit_log

from sqlalchemy.exc import IntegrityError

def insert_raw_email(db: Session, tenant_id: str, mailbox_id: str, provider_message_id: str, thread_id: str, sender: str, subject: str = None, body: str = None, received_at=None, normalized_metadata: dict = None, performed_by: str = "system") -> RawEmail:
    # Idempotency check: check if provider_message_id already exists in this mailbox
    existing = db.query(RawEmail).filter(
        RawEmail.mailbox_id == mailbox_id,
        RawEmail.provider_message_id == provider_message_id
    ).first()
    
    if existing:
        return existing
        
    # Quota check
    from services.quota_service import check_email_quota, increment_email_count, QuotaExceededError
    if not check_email_quota(db, tenant_id):
        raise QuotaExceededError(f"Email ingestion quota exceeded for tenant {tenant_id}")
        
    email_id = str(uuid.uuid4())
    raw_email = RawEmail(
        id=email_id,
        tenant_id=tenant_id,
        mailbox_id=mailbox_id,
        provider_message_id=provider_message_id,
        thread_id=thread_id,
        sender=sender,
        subject=subject,
        body=body,
        received_at=received_at,
        normalized_metadata=normalized_metadata
    )
    db.add(raw_email)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Someone else inserted it in the meantime, fetch it
        existing = db.query(RawEmail).filter(
            RawEmail.mailbox_id == mailbox_id,
            RawEmail.provider_message_id == provider_message_id
        ).first()
        if existing:
            return existing
        raise # If it's another integrity error, re-raise
    
    db.refresh(raw_email)
    
    increment_email_count(db, tenant_id)
    
    try:
        from neuromail.core.api.routes.dashboard_router import invalidate_dashboard_cache
        invalidate_dashboard_cache(tenant_id)
    except Exception:
        pass
    
    # Audit log
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="INSERT_RAW_EMAIL",
        performed_by=performed_by,
        object_type="RAW_EMAIL",
        object_id=email_id,
        changes={
            "provider_message_id": provider_message_id,
            "thread_id": thread_id,
            "sender": sender
        }
    )
    
    return raw_email

def get_raw_emails_by_thread(db: Session, tenant_id: str, mailbox_id: str, thread_id: str):
    return db.query(RawEmail).filter(
        RawEmail.tenant_id == tenant_id,
        RawEmail.mailbox_id == mailbox_id,
        RawEmail.thread_id == thread_id
    ).all()

def list_raw_emails(db: Session, tenant_id: str):
    return db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id).all()

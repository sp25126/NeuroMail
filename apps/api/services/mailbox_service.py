import uuid
import datetime
from sqlalchemy.orm import Session
from models import Mailbox
from services.vault import store_token, retrieve_token
from services.audit_service import create_audit_log

def create_mailbox(db: Session, tenant_id: str, provider_type: str, scope_state: str = None, raw_token: str = None, performed_by: str = "system") -> Mailbox:
    mailbox_id = str(uuid.uuid4())
    token_ref = f"token_{mailbox_id}" if raw_token else None
    
    if raw_token:
        store_token(token_ref, raw_token)
        
    mailbox = Mailbox(
        id=mailbox_id,
        tenant_id=tenant_id,
        provider_type=provider_type,
        connection_status="CONNECTED" if raw_token else "DISCONNECTED",
        token_ref=token_ref,
        scope_state=scope_state,
        last_sync_time=None,
        error_state=None
    )
    db.add(mailbox)
    db.commit()
    db.refresh(mailbox)

    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="CREATE_MAILBOX",
        performed_by=performed_by,
        object_type="MAILBOX",
        object_id=mailbox_id,
        changes={
            "provider_type": provider_type,
            "scope_state": scope_state,
            "raw_token": raw_token  # Will be masked automatically by audit_service
        }
    )

    return mailbox

def update_mailbox_status(db: Session, tenant_id: str, mailbox_id: str, connection_status: str, error_state: str = None, last_sync_time: datetime.datetime = None, performed_by: str = "system") -> Mailbox:
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if not mailbox:
        raise ValueError("Mailbox not found")
        
    old_status = mailbox.connection_status
    mailbox.connection_status = connection_status
    if error_state is not None:
        mailbox.error_state = error_state
    if last_sync_time is not None:
        mailbox.last_sync_time = last_sync_time
        
    db.commit()
    db.refresh(mailbox)

    # Log audit entry
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="UPDATE_MAILBOX_STATUS",
        performed_by=performed_by,
        object_type="MAILBOX",
        object_id=mailbox_id,
        changes={
            "old_status": old_status,
            "connection_status": connection_status,
            "error_state": error_state
        }
    )

    return mailbox

def get_mailbox(db: Session, tenant_id: str, mailbox_id: str) -> Mailbox:
    return db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()

def list_mailboxes(db: Session, tenant_id: str):
    return db.query(Mailbox).filter(Mailbox.tenant_id == tenant_id).all()

def get_mailbox_raw_token(db: Session, tenant_id: str, mailbox_id: str) -> str:
    mailbox = get_mailbox(db, tenant_id, mailbox_id)
    if not mailbox or not mailbox.token_ref:
        return None
    return retrieve_token(mailbox.token_ref)

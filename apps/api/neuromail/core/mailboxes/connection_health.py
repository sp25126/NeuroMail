import datetime
import logging
from sqlalchemy.orm import Session
from models import Mailbox
from services.mailbox_service import update_mailbox_status

logger = logging.getLogger("Mailboxes.ConnectionHealth")

def get_mailbox_health_status(db: Session, tenant_id: str, mailbox_id: str) -> dict:
    """
    Returns connection health operational info for a mailbox.
    Health states: 'HEALTHY', 'DEGRADED', 'ERROR'
    """
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if not mailbox:
        raise ValueError("Mailbox not found")
        
    health_state = "HEALTHY"
    if mailbox.connection_status == "ERROR":
        health_state = "ERROR"
    elif mailbox.last_sync_time:
        # If it hasn't synced in the last 2 hours, flag as DEGRADED
        elapsed = datetime.datetime.utcnow() - mailbox.last_sync_time
        if elapsed > datetime.timedelta(hours=2):
            health_state = "DEGRADED"
    else:
        # Connected but never synced
        health_state = "DEGRADED"
        
    return {
        "mailbox_id": mailbox.id,
        "provider_type": mailbox.provider_type,
        "connection_status": mailbox.connection_status,
        "health_state": health_state,
        "last_sync_time": mailbox.last_sync_time,
        "error_state": mailbox.error_state,
        "webhook_subscription_id": mailbox.webhook_subscription_id,
        "webhook_subscription_expires_at": mailbox.webhook_subscription_expires_at,
        "updated_at": mailbox.updated_at
    }

def record_sync_success(db: Session, tenant_id: str, mailbox_id: str):
    """
    Updates mailbox health state after successful sync.
    """
    update_mailbox_status(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=mailbox_id,
        connection_status="CONNECTED",
        error_state="",
        last_sync_time=datetime.datetime.utcnow(),
        performed_by="health_monitor"
    )

def record_sync_failure(db: Session, tenant_id: str, mailbox_id: str, error_msg: str):
    """
    Updates mailbox health state after failed sync.
    """
    update_mailbox_status(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=mailbox_id,
        connection_status="ERROR",
        error_state=error_msg,
        performed_by="health_monitor"
    )

def check_stale_mailboxes(db: Session):
    """
    Background task to scan all mailboxes and flag stale connections as DEGRADED or needing attention.
    """
    logger.info("Running background stale mailboxes check...")
    stale_limit = datetime.datetime.utcnow() - datetime.timedelta(hours=2)
    
    # Select connected mailboxes that haven't synced in 2 hours
    stale_mailboxes = db.query(Mailbox).filter(
        Mailbox.connection_status == "CONNECTED",
        (Mailbox.last_sync_time == None) | (Mailbox.last_sync_time < stale_limit)
    ).all()
    
    for mailbox in stale_mailboxes:
        logger.warning(
            f"Mailbox {mailbox.id} (tenant {mailbox.tenant_id}) is stale. "
            f"Last sync time: {mailbox.last_sync_time or 'Never'}"
        )
        # Update error state to warn operators/system
        mailbox.error_state = "Stale: Sync has not occurred in the last 2 hours."
        mailbox.updated_at = datetime.datetime.utcnow()
        
    db.commit()
    return len(stale_mailboxes)

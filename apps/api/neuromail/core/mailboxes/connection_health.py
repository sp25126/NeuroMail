import datetime
import logging
from sqlalchemy.orm import Session
from models import Mailbox
from services.mailbox_service import update_mailbox_status

logger = logging.getLogger("Mailboxes.ConnectionHealth")

# Circuit breaker cooldown (in seconds)
COOLDOWN_SECONDS = 30

class CircuitBreakerTrippedError(Exception):
    """Raised when a sync operation is requested on a mailbox whose circuit breaker is tripped."""
    pass

def get_mailbox_health_status(db: Session, tenant_id: str, mailbox_id: str) -> dict:
    """
    Returns connection health operational info for a mailbox.
    Health states: 'HEALTHY', 'DEGRADED', 'ERROR'
    """
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if not mailbox:
        raise ValueError("Mailbox not found")
        
    health_state = "HEALTHY"
    if mailbox.circuit_breaker_tripped or mailbox.connection_status == "ERROR":
        health_state = "ERROR"
    elif mailbox.health_score < 70.0:
        health_state = "DEGRADED"
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
        "updated_at": mailbox.updated_at,
        "health_score": mailbox.health_score,
        "consecutive_failures": mailbox.consecutive_failures,
        "last_failure_reason": mailbox.last_failure_reason,
        "circuit_breaker_tripped": mailbox.circuit_breaker_tripped,
        "circuit_breaker_tripped_at": mailbox.circuit_breaker_tripped_at
    }

def is_circuit_breaker_tripped(db: Session, tenant_id: str, mailbox_id: str) -> bool:
    """
    Check if the circuit breaker is tripped for a mailbox.
    Returns True if sync should be blocked, False if sync is allowed (Healthy or Half-Open).
    """
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if not mailbox:
        return False
    if not mailbox.circuit_breaker_tripped:
        return False
        
    if mailbox.circuit_breaker_tripped_at:
        elapsed = (datetime.datetime.utcnow() - mailbox.circuit_breaker_tripped_at).total_seconds()
        if elapsed >= COOLDOWN_SECONDS:
            logger.info(f"Mailbox {mailbox_id} circuit breaker is HALF-OPEN (cooldown of {COOLDOWN_SECONDS}s elapsed)")
            return False
            
    return True

def record_sync_success(db: Session, tenant_id: str, mailbox_id: str):
    """
    Updates mailbox health state after successful sync.
    Resets the circuit breaker and consecutive failures.
    """
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if mailbox:
        mailbox.connection_status = "CONNECTED"
        mailbox.error_state = ""
        mailbox.last_sync_time = datetime.datetime.utcnow()
        mailbox.consecutive_failures = 0
        mailbox.health_score = 100.0
        mailbox.circuit_breaker_tripped = False
        mailbox.circuit_breaker_tripped_at = None
        mailbox.last_failure_reason = None
        mailbox.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(mailbox)
        logger.info(f"Mailbox {mailbox_id} synced successfully. Health score reset to 100.0.")

def record_sync_failure(db: Session, tenant_id: str, mailbox_id: str, error_msg: str):
    """
    Updates mailbox health state after failed sync.
    Increases consecutive failure counts, degrades health score, and trips breaker if needed.
    """
    mailbox = db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
    if mailbox:
        mailbox.consecutive_failures += 1
        mailbox.health_score = max(0.0, mailbox.health_score - 20.0)
        mailbox.last_failure_reason = error_msg
        mailbox.error_state = error_msg
        mailbox.updated_at = datetime.datetime.utcnow()
        mailbox.connection_status = "ERROR"
        
        if mailbox.consecutive_failures >= 5:
            mailbox.circuit_breaker_tripped = True
            mailbox.circuit_breaker_tripped_at = datetime.datetime.utcnow()
            logger.warning(f"Mailbox {mailbox_id} circuit breaker TRIPPED after {mailbox.consecutive_failures} consecutive failures.")
        else:
            logger.info(f"Mailbox {mailbox_id} sync failed. Consecutive failures: {mailbox.consecutive_failures}, Health score: {mailbox.health_score}")
            
        db.commit()
        db.refresh(mailbox)

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
        # Update health details
        mailbox.error_state = "Stale: Sync has not occurred in the last 2 hours."
        mailbox.health_score = max(0.0, mailbox.health_score - 10.0)
        mailbox.updated_at = datetime.datetime.utcnow()
        
    db.commit()
    return len(stale_mailboxes)

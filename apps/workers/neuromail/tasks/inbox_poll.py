import sys
import os
import logging
import datetime

# Ensure the apps/api directory is in the path to allow imports of DB, models, and adapters
sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")

from database import SessionLocal
from models import Mailbox
from neuromail.core.mailboxes.sync_service import SyncService
from neuromail.core.mailboxes import connection_health

logger = logging.getLogger("Worker.InboxPoll")

def poll_all_connected_mailboxes() -> dict:
    """
    Scans the database for all connected mailboxes and polls them for new messages.
    Handles rate-limiting, token refreshes, and updates connection status.
    Now uses SyncService for robust incremental sync support.
    """
    logger.info("Starting scheduled inbox polling fallbacks and maintenance...")
    db = SessionLocal()
    sync_service = SyncService(db)
    
    results = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "messages_ingested": 0,
        "subscriptions_renewed": 0
    }
    
    try:
        # 1. Maintain active subscriptions (Renew before expiry)
        try:
            renewed = sync_service.maintain_all_subscriptions()
            results["subscriptions_renewed"] = renewed
            if renewed > 0:
                logger.info(f"Renewed {renewed} mailbox subscriptions.")
        except Exception as maint_err:
            logger.error(f"Subscription maintenance failed: {str(maint_err)}")

        # 2. Fetch all CONNECTED mailboxes for polling fallbacks
        mailboxes = db.query(Mailbox).filter(Mailbox.connection_status == "CONNECTED").all()
        logger.info(f"Found {len(mailboxes)} connected mailboxes to poll.")
        
        for mailbox in mailboxes:
            results["processed"] += 1
            logger.info(f"Syncing mailbox {mailbox.id} (provider: {mailbox.provider_type}, tenant: {mailbox.tenant_id})...")
            try:
                sync_res = sync_service.sync_mailbox(mailbox.tenant_id, mailbox.id)
                results["success"] += 1
                results["messages_ingested"] += sync_res.get("synced_count", 0)
                logger.info(f"Successfully synced mailbox {mailbox.id}. Ingested {sync_res.get('synced_count')} messages.")
            except Exception as e:
                # Catch failures so one broken mailbox doesn't stall the whole loop
                logger.error(f"Failed to sync mailbox {mailbox.id}: {str(e)}")
                results["failed"] += 1
                
        # 3. Run stale checks on all mailboxes to flag those needing manual re-auth
        try:
            stale_count = connection_health.check_stale_mailboxes(db)
            if stale_count > 0:
                logger.info(f"Stale checks completed. {stale_count} stale mailboxes flagged.")
        except Exception as stale_err:
            logger.error(f"Stale connection health check failed: {str(stale_err)}")
            
        return results
    finally:
        db.close()

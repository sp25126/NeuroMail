import sys
import os
import logging
import datetime

# Ensure the apps/api directory is in the path to allow imports of DB, models, and adapters
sys.path.insert(0, "c:/Users/saumy/OneDrive/Desktop/Neuromail/apps/api")

from database import SessionLocal
from models import Mailbox
from neuromail.core.mailboxes.provider_factory import ProviderFactory
from neuromail.core.raw_email import ingestion_service
from neuromail.core.mailboxes import connection_health, sync_state

logger = logging.getLogger("Worker.InboxPoll")

def poll_all_connected_mailboxes() -> dict:
    """
    Scans the database for all connected mailboxes and polls them for new messages.
    Handles rate-limiting, token refreshes, and updates connection status.
    """
    logger.info("Starting scheduled inbox polling fallbacks...")
    db = SessionLocal()
    try:
        # Fetch all CONNECTED mailboxes
        mailboxes = db.query(Mailbox).filter(Mailbox.connection_status == "CONNECTED").all()
        logger.info(f"Found {len(mailboxes)} connected mailboxes to poll.")
        
        results = {
            "processed": 0,
            "success": 0,
            "failed": 0,
            "messages_ingested": 0
        }
        
        for mailbox in mailboxes:
            results["processed"] += 1
            logger.info(f"Polling mailbox {mailbox.id} (provider: {mailbox.provider_type}, tenant: {mailbox.tenant_id})...")
            try:
                adapter = ProviderFactory.get_adapter(mailbox.provider_type)
                
                # Fetch messages since the last known sync timestamp
                since_time = mailbox.last_sync_time
                messages = adapter.fetch_messages(mailbox, db, since_time=since_time)
                
                # Route through ingestion service
                ingested = ingestion_service.ingest_batch(
                    db=db,
                    tenant_id=mailbox.tenant_id,
                    mailbox_id=mailbox.id,
                    messages=messages,
                    performed_by="polling_worker"
                )
                
                # Update sync state and connection health on success
                connection_health.record_sync_success(db, mailbox.tenant_id, mailbox.id)
                results["success"] += 1
                results["messages_ingested"] += len(ingested)
                logger.info(f"Successfully polled mailbox {mailbox.id}. Ingested {len(ingested)} new messages.")
                
            except Exception as e:
                # Catch failures so a broken token or API error doesn't crash the worker queue
                logger.error(f"Failed to poll mailbox {mailbox.id}: {str(e)}")
                connection_health.record_sync_failure(db, mailbox.tenant_id, mailbox.id, str(e))
                results["failed"] += 1
                
        # Also run stale checks on all mailboxes
        try:
            stale_count = connection_health.check_stale_mailboxes(db)
            logger.info(f"Stale checks completed. {stale_count} stale mailboxes flagged.")
        except Exception as stale_err:
            logger.error(f"Stale connection health check failed: {str(stale_err)}")
            
        return results
    finally:
        db.close()

import datetime
import logging
import uuid
from sqlalchemy.orm import Session
from typing import List, Optional

from models import Mailbox, RawEmail, Attachment
from neuromail.core.mailboxes.provider_factory import ProviderFactory
from neuromail.core.mailboxes.connection_health import (
    record_sync_success,
    record_sync_failure,
    is_circuit_breaker_tripped,
    CircuitBreakerTrippedError
)
from neuromail.core.raw_email import ingestion_service

logger = logging.getLogger("Mailboxes.SyncService")

class SyncService:
    def __init__(self, db: Session):
        self.db = db

    def sync_mailbox(self, tenant_id: str, mailbox_id: str) -> dict:
        """
        Orchestrates the synchronization process for a specific mailbox.
        Handles Gmail incremental sync (historyId) and Outlook time-based sync.
        Enforces circuit breaker checks before execution.
        """
        mailbox = self.db.query(Mailbox).filter(Mailbox.id == mailbox_id, Mailbox.tenant_id == tenant_id).first()
        if not mailbox:
            raise ValueError(f"Mailbox {mailbox_id} not found")

        # Check circuit breaker
        if is_circuit_breaker_tripped(self.db, tenant_id, mailbox_id):
            logger.warning(f"Sync request for mailbox {mailbox_id} blocked by circuit breaker.")
            raise CircuitBreakerTrippedError(f"Circuit breaker is tripped for mailbox {mailbox_id}")

        adapter = ProviderFactory.get_adapter(mailbox.provider_type)
        
        try:
            # 1. Fetch messages based on provider capabilities
            if mailbox.provider_type == "GMAIL" and mailbox.last_history_id:
                logger.info(f"Performing incremental sync for Gmail mailbox {mailbox_id} from historyId {mailbox.last_history_id}")
                result = adapter.fetch_messages_by_history(mailbox, self.db, mailbox.last_history_id)
            else:
                logger.info(f"Performing full/time-based sync for mailbox {mailbox_id}")
                result = adapter.fetch_messages(mailbox, self.db, since_time=mailbox.last_sync_time)

            messages = result.get("messages", [])
            new_history_id = result.get("history_id")

            # 2. Process and store raw emails (idempotency handled by ingestion service)
            ingested = ingestion_service.ingest_batch(
                db=self.db,
                tenant_id=tenant_id,
                mailbox_id=mailbox_id,
                messages=messages,
                performed_by="sync_worker"
            )

            # 3. Update sync state
            if new_history_id:
                mailbox.last_history_id = new_history_id
            
            record_sync_success(self.db, tenant_id, mailbox_id)
            self.db.commit()

            logger.info(f"Sync completed for mailbox {mailbox_id}. Ingested {len(ingested)} messages.")
            return {
                "status": "success",
                "synced_count": len(ingested),
                "history_id": new_history_id
            }

        except Exception as e:
            logger.error(f"Sync failed for mailbox {mailbox_id}: {str(e)}")
            record_sync_failure(self.db, tenant_id, mailbox_id, str(e))
            self.db.commit()
            raise e

    def check_webhook_drift_and_fallback(self, minutes_threshold: int = 30) -> int:
        """
        Scans all connected mailboxes that have active webhook subscriptions.
        If last_webhook_received_at is older than the threshold, degrades its health state
        and triggers a polling sync automatically as a fallback.
        """
        logger.info(f"Checking for webhook drift across mailboxes (threshold: {minutes_threshold} mins)...")
        now = datetime.datetime.utcnow()
        drift_limit = now - datetime.timedelta(minutes=minutes_threshold)
        
        mailboxes = self.db.query(Mailbox).filter(
            Mailbox.connection_status == "CONNECTED",
            Mailbox.webhook_subscription_id != None
        ).all()
        
        drifted_count = 0
        for mailbox in mailboxes:
            # Check duration since last webhook, fallback to creation time or last sync time
            reference_time = mailbox.last_webhook_received_at or mailbox.last_sync_time or mailbox.created_at
            if reference_time < drift_limit:
                logger.warning(
                    f"Webhook drift detected on mailbox {mailbox.id} (tenant {mailbox.tenant_id}). "
                    f"Last sync/webhook: {reference_time}. Running fallback polling sync."
                )
                
                # Degrade health score slightly
                mailbox.health_score = max(0.0, mailbox.health_score - 10.0)
                mailbox.error_state = "Webhook drift detected. Fallback polling triggered."
                self.db.commit()
                
                try:
                    # Execute fallback polling sync directly
                    self.sync_mailbox(mailbox.tenant_id, mailbox.id)
                    drifted_count += 1
                except Exception as e:
                    logger.error(f"Fallback sync failed for drifted mailbox {mailbox.id}: {str(e)}")
                    
        return drifted_count

    def maintain_all_subscriptions(self):
        """
        Scans all mailboxes and renews subscriptions that are nearing expiry.
        """
        now = datetime.datetime.utcnow()
        # Renew if expiring in less than 24 hours
        threshold = now + datetime.timedelta(hours=24)
        
        mailboxes = self.db.query(Mailbox).filter(
            Mailbox.connection_status == "CONNECTED",
            Mailbox.webhook_subscription_expires_at != None,
            Mailbox.webhook_subscription_expires_at < threshold
        ).all()
        
        renewed_count = 0
        for mailbox in mailboxes:
            try:
                adapter = ProviderFactory.get_adapter(mailbox.provider_type)
                if hasattr(adapter, "renew_subscription"):
                    adapter.renew_subscription(mailbox, self.db)
                else:
                    # Fallback to re-watching (Gmail watch, etc.)
                    adapter.watch(mailbox, self.db)
                renewed_count += 1
            except Exception as e:
                logger.error(f"Failed to maintain subscription for mailbox {mailbox.id}: {str(e)}")
        
        return renewed_count

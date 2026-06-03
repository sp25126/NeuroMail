import uuid
import datetime
import logging
from sqlalchemy.orm import Session
from models import DeadLetterQueue
from neuromail.core.mailboxes.sync_service import SyncService
from neuromail.core.raw_email.processing_pipeline import process_email_pipeline

logger = logging.getLogger("Services.DLQService")

def add_to_dlq(
    db: Session,
    tenant_id: str,
    job_type: str,
    payload: dict,
    error_message: str,
    retry_count: int = 0
) -> DeadLetterQueue:
    """
    Inserts a failed task execution into the dead letter queue table.
    """
    dlq_id = str(uuid.uuid4())
    dlq_item = DeadLetterQueue(
        id=dlq_id,
        tenant_id=tenant_id,
        job_type=job_type,
        payload=payload,
        error_message=error_message,
        retry_count=retry_count,
        status="FAILED",
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow()
    )
    db.add(dlq_item)
    db.commit()
    db.refresh(dlq_item)
    logger.warning(f"Recorded job failure in DLQ: {dlq_id} (type: {job_type}, tenant: {tenant_id})")
    return dlq_item

def list_dlq(db: Session, tenant_id: str) -> list:
    """
    Lists all DLQ records for a specific tenant to prevent cross-tenant exposure.
    """
    return db.query(DeadLetterQueue).filter(DeadLetterQueue.tenant_id == tenant_id).order_by(DeadLetterQueue.created_at.desc()).all()

def replay_job(db: Session, tenant_id: str, dlq_id: str) -> dict:
    """
    Replays a job from the DLQ idempotently.
    Updates the status to REPLAYED if it succeeds, or raises an error if replay fails.
    """
    dlq_item = db.query(DeadLetterQueue).filter(
        DeadLetterQueue.id == dlq_id,
        DeadLetterQueue.tenant_id == tenant_id
    ).first()
    
    if not dlq_item:
        raise ValueError(f"DLQ item {dlq_id} not found")
        
    logger.info(f"Replaying DLQ job {dlq_id} (type: {dlq_item.job_type}) for tenant {tenant_id}")
    
    try:
        if dlq_item.job_type == "SYNC_MAILBOX":
            mailbox_id = dlq_item.payload.get("mailbox_id")
            if not mailbox_id:
                raise ValueError("Missing mailbox_id in payload for SYNC_MAILBOX job")
            sync_service = SyncService(db)
            sync_service.sync_mailbox(tenant_id, mailbox_id)
            
        elif dlq_item.job_type == "PROCESS_EMAIL":
            raw_email_id = dlq_item.payload.get("raw_email_id")
            if not raw_email_id:
                raise ValueError("Missing raw_email_id in payload for PROCESS_EMAIL job")
            process_email_pipeline(db, tenant_id, raw_email_id)
            
        elif dlq_item.job_type == "GENERATE_REPORT":
            report_run_id = dlq_item.payload.get("report_run_id")
            if not report_run_id:
                raise ValueError("Missing report_run_id in payload for GENERATE_REPORT job")
            from models import ReportRun
            from neuromail.core.raw_email.report_engine import run_report_definition
            report_run = db.query(ReportRun).filter(
                ReportRun.id == report_run_id,
                ReportRun.tenant_id == tenant_id
            ).first()
            if not report_run:
                raise ValueError(f"ReportRun {report_run_id} not found")
            run_report_definition(db, report_run)
            
        else:
            raise ValueError(f"Unsupported job type for replay: {dlq_item.job_type}")
            
        # Mark as replayed successfully
        dlq_item.status = "REPLAYED"
        dlq_item.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(dlq_item)
        
        logger.info(f"DLQ job {dlq_id} successfully replayed.")
        return {
            "status": "success",
            "dlq_id": dlq_id,
            "job_type": dlq_item.job_type
        }
        
    except Exception as e:
        logger.error(f"Failed to replay DLQ job {dlq_id}: {str(e)}")
        # Increment retry count in DLQ and re-raise
        dlq_item.retry_count += 1
        dlq_item.error_message = f"Replay failed: {str(e)}"
        dlq_item.updated_at = datetime.datetime.utcnow()
        db.commit()
        raise e

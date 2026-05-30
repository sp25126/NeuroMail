from fastapi import FastAPI, HTTPException, status, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
import sys
import redis

from config import settings
from database import check_db_connectivity, get_db
import schemas
from services import (
    mailbox_service,
    email_service,
    entity_service,
    identifier_service,
    event_service,
    audit_service
)
from neuromail.core.api.routes import gmail_auth, outlook_auth, webhooks
from neuromail.core.api.routes import rules_router, alerts_router, review_router, search_router
from neuromail.core.raw_email import thread_service, attachment_service
from neuromail.core.raw_email import processing_pipeline
from neuromail.core.raw_email.observability import metrics_store
from neuromail.core.mailboxes import connection_health


# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("API.Main")

logger.info("Initializing Neuromail API Backend...")

app = FastAPI(
    title="Neuromail API",
    version="1.0.0",
    description="FastAPI orchestration service for Neuromail email and freight tracking"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gmail_auth.router)
app.include_router(outlook_auth.router)
app.include_router(webhooks.router)
app.include_router(rules_router.router)
app.include_router(alerts_router.router)
app.include_router(review_router.router)
app.include_router(search_router.router)


def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """
    Returns application process status.
    """
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "version": "1.0.0"
    }

def check_redis_connectivity() -> bool:
    try:
        if not settings.REDIS_URL:
            return False
        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        r.ping()
        return True
    except Exception as e:
        logger.error(f"Redis connection failed: {str(e)}")
        return False

@app.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check():
    """
    Returns ready status only if both database and redis connections resolve.
    """
    db_ok = check_db_connectivity()
    redis_ok = check_redis_connectivity()
    if not db_ok or not redis_ok:
        db_status = "ok" if db_ok else "down"
        redis_status = "ok" if redis_ok else "down"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "error",
                "db": db_status,
                "redis": redis_status,
                "message": f"Database is {db_status}, Redis is {redis_status}"
            }
        )
    return {
        "status": "ready",
        "db": "ok",
        "redis": "ok"
    }

# ----------------- MAILBOX ROUTES -----------------

@app.post("/mailboxes", response_model=schemas.MailboxResponse, status_code=201)
def create_mailbox(
    payload: schemas.MailboxCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return mailbox_service.create_mailbox(
        db=db,
        tenant_id=tenant_id,
        provider_type=payload.provider_type,
        scope_state=payload.scope_state,
        raw_token=payload.raw_token,
        performed_by="user@example.com"
    )

@app.get("/mailboxes", response_model=List[schemas.MailboxResponse])
def list_mailboxes(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return mailbox_service.list_mailboxes(db=db, tenant_id=tenant_id)

@app.patch("/mailboxes/{mailbox_id}/status", response_model=schemas.MailboxResponse)
def update_mailbox_status(
    mailbox_id: str,
    payload: schemas.MailboxUpdateStatus,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return mailbox_service.update_mailbox_status(
            db=db,
            tenant_id=tenant_id,
            mailbox_id=mailbox_id,
            connection_status=payload.connection_status,
            error_state=payload.error_state,
            last_sync_time=payload.last_sync_time,
            performed_by="user@example.com"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ----------------- RAW EMAIL ROUTES -----------------

@app.post("/emails", response_model=schemas.RawEmailResponse, status_code=201)
def insert_raw_email(
    payload: schemas.RawEmailCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return email_service.insert_raw_email(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=payload.mailbox_id,
        provider_message_id=payload.provider_message_id,
        thread_id=payload.thread_id,
        sender=payload.sender,
        subject=payload.subject,
        body=payload.body,
        received_at=payload.received_at,
        normalized_metadata=payload.normalized_metadata,
        performed_by="user@example.com"
    )

@app.get("/emails", response_model=List[schemas.RawEmailResponse])
def list_raw_emails(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return email_service.list_raw_emails(db=db, tenant_id=tenant_id)

@app.get("/emails/thread/{thread_id}", response_model=List[schemas.RawEmailResponse])
def get_raw_emails_by_thread(
    thread_id: str,
    mailbox_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return email_service.get_raw_emails_by_thread(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=mailbox_id,
        thread_id=thread_id
    )

# ----------------- ENTITY ROUTES -----------------

@app.post("/entities", response_model=schemas.EntityResponse, status_code=201)
def create_entity(
    payload: schemas.EntityCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return entity_service.create_entity(
        db=db,
        tenant_id=tenant_id,
        status=payload.status,
        identity=payload.identity,
        source_reference=payload.source_reference,
        metadata_json=payload.metadata_json,
        performed_by="user@example.com"
    )

@app.get("/entities", response_model=List[schemas.EntityResponse])
def list_entities(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return entity_service.list_entities(db=db, tenant_id=tenant_id)

@app.get("/entities/{entity_id}", response_model=schemas.EntityResponse)
def get_entity(
    entity_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    entity = entity_service.get_entity(db=db, tenant_id=tenant_id, entity_id=entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity

@app.patch("/entities/{entity_id}", response_model=schemas.EntityResponse)
def update_entity(
    entity_id: str,
    payload: schemas.EntityUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return entity_service.update_entity(
            db=db,
            tenant_id=tenant_id,
            entity_id=entity_id,
            status=payload.status,
            identity=payload.identity,
            metadata_json=payload.metadata_json,
            performed_by="user@example.com"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ----------------- IDENTIFIER ROUTES -----------------

@app.post("/entities/{entity_id}/identifiers", response_model=schemas.IdentifierResponse, status_code=201)
def add_identifier(
    entity_id: str,
    payload: schemas.IdentifierCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return identifier_service.add_identifier(
            db=db,
            tenant_id=tenant_id,
            entity_id=entity_id,
            identifier_type=payload.identifier_type,
            identifier_value=payload.identifier_value,
            source=payload.source,
            performed_by="user@example.com"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/identifiers/resolve", response_model=schemas.EntityResponse)
def resolve_entity_by_identifier(
    identifier_type: str,
    identifier_value: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    entity = identifier_service.resolve_entity_by_identifier(
        db=db,
        tenant_id=tenant_id,
        identifier_type=identifier_type,
        identifier_value=identifier_value
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found for specified identifier")
    return entity

@app.delete("/identifiers/{identifier_id}")
def remove_identifier(
    identifier_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        identifier_service.remove_identifier(
            db=db,
            tenant_id=tenant_id,
            identifier_id=identifier_id,
            performed_by="user@example.com"
        )
        return {"status": "success", "message": "Identifier removed"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ----------------- EVENT ROUTES -----------------

@app.post("/entities/{entity_id}/events", response_model=schemas.EventResponse, status_code=201)
def append_event(
    entity_id: str,
    payload: schemas.EventCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return event_service.append_event(
            db=db,
            tenant_id=tenant_id,
            entity_id=entity_id,
            event_type=payload.event_type,
            payload=payload.payload,
            source=payload.source,
            created_by="user@example.com"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/entities/{entity_id}/timeline", response_model=List[schemas.EventResponse])
def get_entity_timeline(
    entity_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return event_service.get_entity_timeline(
        db=db,
        tenant_id=tenant_id,
        entity_id=entity_id
    )

# ----------------- AUDIT LOG ROUTES -----------------

@app.get("/audit_logs", response_model=List[schemas.AuditLogResponse])
def get_audit_logs(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return audit_service.get_audit_logs(db=db, tenant_id=tenant_id)

# ----------------- INGESTION READINESS HOOKS -----------------

@app.post("/ingestion/mock", status_code=201)
def mock_ingestion_hook(
    payload: schemas.RawEmailCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    # Safe insert raw email (with idempotency handling)
    email = email_service.insert_raw_email(
        db=db,
        tenant_id=tenant_id,
        mailbox_id=payload.mailbox_id,
        provider_message_id=payload.provider_message_id,
        thread_id=payload.thread_id,
        sender=payload.sender,
        subject=payload.subject,
        body=payload.body,
        received_at=payload.received_at,
        normalized_metadata=payload.normalized_metadata,
        performed_by="ingestion_worker"
    )

    # Ingestion flow registers event
    # Find or create a mock entity linked to this ingestion reference
    entity = entity_service.create_entity(
        db=db,
        tenant_id=tenant_id,
        status="ACTIVE",
        identity=f"Ingested Email: {payload.subject or 'No Subject'}",
        source_reference=f"raw_emails/{email.id}",
        performed_by="ingestion_worker"
    )

    # Log ingestion timeline event
    event_service.append_event(
        db=db,
        tenant_id=tenant_id,
        entity_id=entity.id,
        event_type="EMAIL_INGESTED",
        payload={
            "raw_email_id": email.id,
            "provider_message_id": payload.provider_message_id,
            "thread_id": payload.thread_id
        },
        source="SYSTEM",
        created_by="ingestion_worker"
    )

    return {
        "status": "success",
        "email_id": email.id,
        "entity_id": entity.id
    }

# ----------------- THREAD & ATTACHMENT & HEALTH FALLBACKS -----------------

@app.get("/api/threads/{thread_id}")
def get_thread_details(
    thread_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        res = thread_service.get_thread_by_id(db, tenant_id, thread_id)
        if not res:
            raise HTTPException(status_code=404, detail="Thread not found")
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/raw-emails/{raw_email_id}/attachments")
def get_raw_email_attachments(
    raw_email_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        attachments = attachment_service.get_attachments_by_email(db, tenant_id, raw_email_id)
        return attachments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mailboxes/{mailbox_id}/status")
@app.get("/mailboxes/{mailbox_id}/status")
def get_mailbox_health_endpoint(
    mailbox_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    try:
        return connection_health.get_mailbox_health_status(db, tenant_id, mailbox_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- PHASE 4 INTELLIGENCE PIPELINE -----------------

@app.post("/pipeline/process/{raw_email_id}")
def run_processing_pipeline(
    raw_email_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Trigger Phase 4 intelligence pipeline on a specific raw email.
    Runs: parse → AI enrichment → entity mapping → events → rule evaluation → alerts.
    """
    try:
        result = processing_pipeline.process_email_pipeline(db, tenant_id, raw_email_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Pipeline execution failed for raw_email: {raw_email_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
def get_observability_metrics():
    """
    Returns current pipeline processing throughput metrics for observability.
    """
    return metrics_store.get_summary()



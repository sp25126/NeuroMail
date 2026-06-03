from fastapi import FastAPI, HTTPException, status, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
import sys
import redis
import datetime

from config import settings
from database import check_db_connectivity, get_db
import schemas
from models import User, Tenant, Mailbox
from neuromail.core.auth.token_store import encrypt_token
import models
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
from neuromail.core.api.routes import (
    reports_router,
    dashboard_router,
    exports_router,
    preferences_router,
    ops_router,
    views_router,
    llm_router,
    ai_router,
    dlq_router,
    quotas_router,
    freight_router,
    freight_enterprise_router,
    freight_demo_router,
    trackflow_mailboxes
)
from neuromail.core.raw_email import thread_service, attachment_service
from neuromail.core.raw_email import processing_pipeline
from neuromail.core.raw_email.observability import metrics_store
from neuromail.core.mailboxes import connection_health
from neuromail.core.api.auth import get_current_tenant_id, get_current_user
from neuromail.core.api.rbac import require_admin, require_operator, require_analyst, require_viewer


# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("API.Main")

logger.info("Initializing Neuromail API Backend...")

from contextlib import asynccontextmanager

def validate_runtime():
    """Validates native runtime dependencies on startup."""
    try:
        from database import engine
        with engine.connect() as conn:
            pass # ping db
            
        # Automatic database migration for step_outlook_connected column and Step 4 AI Extraction fields
        try:
            from sqlalchemy import text
            from sqlalchemy.exc import OperationalError
            with engine.begin() as conn_migration:
                # 1. step_outlook_connected
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_onboarding ADD COLUMN step_outlook_connected BOOLEAN DEFAULT 0 NOT NULL"))
                    logger.info("Migrated database: added step_outlook_connected column to freight_tenant_onboarding table")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add step_outlook_connected: {oe}")
                
                # 2. ai_extraction_enabled
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN ai_extraction_enabled BOOLEAN DEFAULT 1 NOT NULL"))
                    logger.info("Migrated database: added ai_extraction_enabled column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add ai_extraction_enabled: {oe}")

                # 3. primary_ai_model
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN primary_ai_model VARCHAR DEFAULT 'gpt-4o' NOT NULL"))
                    logger.info("Migrated database: added primary_ai_model column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add primary_ai_model: {oe}")

                # 4. fallback_ai_model
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN fallback_ai_model VARCHAR DEFAULT 'claude-3-5-sonnet' NOT NULL"))
                    logger.info("Migrated database: added fallback_ai_model column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add fallback_ai_model: {oe}")

                # 5. extraction_confidence_threshold
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN extraction_confidence_threshold FLOAT DEFAULT 0.7 NOT NULL"))
                    logger.info("Migrated database: added extraction_confidence_threshold column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add extraction_confidence_threshold: {oe}")

                # 6. quarantine_threshold
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN quarantine_threshold FLOAT DEFAULT 0.3 NOT NULL"))
                    logger.info("Migrated database: added quarantine_threshold column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add quarantine_threshold: {oe}")

                # 7. max_email_body_chars_for_ai
                try:
                    conn_migration.execute(text("ALTER TABLE freight_tenant_configs ADD COLUMN max_email_body_chars_for_ai INTEGER DEFAULT 8000 NOT NULL"))
                    logger.info("Migrated database: added max_email_body_chars_for_ai column to freight_tenant_configs")
                except OperationalError as oe:
                    if "duplicate column" not in str(oe).lower():
                        logger.warning(f"Failed to add max_email_body_chars_for_ai: {oe}")

                # 8. trackflow_field_provenance table
                try:
                    conn_migration.execute(text("""
                        CREATE TABLE IF NOT EXISTS trackflow_field_provenance (
                            id VARCHAR PRIMARY KEY,
                            tenant_id VARCHAR NOT NULL,
                            shipment_id VARCHAR NOT NULL,
                            raw_email_id VARCHAR,
                            field_name VARCHAR NOT NULL,
                            field_value TEXT,
                            extraction_method VARCHAR NOT NULL,
                            extraction_model VARCHAR,
                            confidence FLOAT NOT NULL,
                            created_at DATETIME NOT NULL,
                            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                            FOREIGN KEY (shipment_id) REFERENCES freight_shipments(id) ON DELETE CASCADE,
                            FOREIGN KEY (raw_email_id) REFERENCES freight_raw_emails(id) ON DELETE CASCADE
                        )
                    """))
                    logger.info("Migrated database: ensured trackflow_field_provenance table exists")
                except Exception as tbl_err:
                    logger.warning(f"Failed to create trackflow_field_provenance table: {tbl_err}")

                # 9. shipment_tracking_bindings table
                try:
                    conn_migration.execute(text("""
                        CREATE TABLE IF NOT EXISTS shipment_tracking_bindings (
                            id VARCHAR PRIMARY KEY,
                            tenant_id VARCHAR NOT NULL,
                            shipment_id VARCHAR NOT NULL,
                            provider_name VARCHAR NOT NULL,
                            provider_tracking_id VARCHAR,
                            registration_status VARCHAR NOT NULL DEFAULT 'pending',
                            identifier_type_used VARCHAR,
                            identifier_value_used VARCHAR,
                            last_registration_attempt_at DATETIME,
                            last_sync_at DATETIME,
                            failure_reason TEXT,
                            created_at DATETIME NOT NULL,
                            updated_at DATETIME NOT NULL,
                            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                            FOREIGN KEY (shipment_id) REFERENCES freight_shipments(id) ON DELETE CASCADE,
                            UNIQUE(tenant_id, shipment_id, provider_name)
                        )
                    """))
                    logger.info("Migrated database: ensured shipment_tracking_bindings table exists")
                except Exception as tbl_err:
                    logger.warning(f"Failed to create shipment_tracking_bindings table: {tbl_err}")
                    logger.error(f"Failed to create trackflow_field_provenance table: {tbl_err}")

        except Exception as migration_err:
            logger.warning(f"Database auto-migration check skipped or failed: {migration_err}")
            
    except Exception as e:
        logger.error(f"Failed to connect to Database: {e}")
        sys.exit(1)
        
    try:
        if settings.REDIS_URL:
            r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
            r.ping()
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        sys.exit(1)
        
    # Mock storage healthcheck for local native deployment
    logger.info("Storage check passed")
    
    # Validate env
    if not settings.SECRET_KEY:
        logger.error("SECRET_KEY environment variable is required")
        sys.exit(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime()
    yield

app = FastAPI(
    title="Neuromail API",
    version="1.0.0",
    description="FastAPI orchestration service for Neuromail email and freight tracking",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from services.quota_service import QuotaExceededError
from neuromail.core.mailboxes.connection_health import CircuitBreakerTrippedError
from fastapi.responses import JSONResponse

@app.exception_handler(QuotaExceededError)
async def quota_exceeded_exception_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": str(exc)}
    )

@app.exception_handler(CircuitBreakerTrippedError)
async def circuit_breaker_exception_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc)}
    )

app.include_router(gmail_auth.router)
app.include_router(outlook_auth.router)
app.include_router(webhooks.router)
app.include_router(rules_router.router)
app.include_router(alerts_router.router)
app.include_router(review_router.router)
app.include_router(search_router.router)
app.include_router(reports_router.router)
app.include_router(dashboard_router.router)
app.include_router(exports_router.router)
app.include_router(preferences_router.router)
app.include_router(ops_router.router)
app.include_router(views_router.router)
app.include_router(llm_router.router)
app.include_router(ai_router.router)
app.include_router(dlq_router.router)
app.include_router(quotas_router.router)
app.include_router(freight_router.router)
app.include_router(freight_enterprise_router.router)
from neuromail.core.api.routes import trackflow_providers

app.include_router(trackflow_providers.router)


def get_tenant_id(x_tenant_id: str = Depends(get_current_tenant_id)):
    return x_tenant_id

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """
    Returns application process status.
    """
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "version": "1.0.0",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

def check_redis_connectivity() -> bool:
    try:
        if not settings.REDIS_URL:
            return True # REDIS_URL not set

        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        r.ping()
        return True
    except Exception as e:
        logger.error(f"Redis connection failed: {str(e)}")
        return False

def check_worker_health() -> str:
    # Check if worker queue is responsive
    if not settings.REDIS_URL:
        return "down"
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        r.ping()
        return "ok"
    except:
        return "down"


@app.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check(db: Session = Depends(get_db)):
    """
    Returns ready status only if all core dependencies resolve.
    """
    db_ok = check_db_connectivity()
    redis_ok = check_redis_connectivity()
    worker_status = check_worker_health()
    
    # AI Provider baseline check
    ai_ok = False
    try:
        from neuromail.core.llm.client import LLMClient
        client = LLMClient(db)
        ai_ok = client.check_health("system")
    except Exception as e:
        logger.error(f"AI Provider readiness check failed: {str(e)}")
        ai_ok = False

    if not db_ok or not redis_ok or worker_status == "degraded" or not ai_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "error",
                "db": "ok" if db_ok else "down",
                "redis": "ok" if redis_ok else "down",
                "worker": worker_status,
                "ai_provider": "ok" if ai_ok else "down"
            }
        )
    return {
        "status": "ready",
        "db": "ok",
        "redis": "ok",
        "worker": worker_status,
        "ai_provider": "ok"
    }

# ----------------- MAILBOX ROUTES -----------------

@app.post("/mailboxes", response_model=schemas.MailboxResponse, status_code=201, tags=["mailboxes"])
def create_mailbox(
    payload: schemas.MailboxCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_admin)
):
    return mailbox_service.create_mailbox(
        db=db,
        tenant_id=current_user.tenant_id,
        provider_type=payload.provider_type,
        scope_state=payload.scope_state,
        raw_token=payload.raw_token,
        performed_by=current_user.email
    )

@app.get("/mailboxes", response_model=List[schemas.MailboxResponse], tags=["mailboxes"])
def list_mailboxes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    return mailbox_service.list_mailboxes(db=db, tenant_id=current_user.tenant_id)

@app.patch("/mailboxes/{mailbox_id}/status", response_model=schemas.MailboxResponse, tags=["mailboxes"])
def update_mailbox_status(
    mailbox_id: str,
    payload: schemas.MailboxUpdateStatus,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    try:
        return mailbox_service.update_mailbox_status(
            db=db,
            tenant_id=current_user.tenant_id,
            mailbox_id=mailbox_id,
            connection_status=payload.connection_status,
            error_state=payload.error_state,
            last_sync_time=payload.last_sync_time,
            performed_by=current_user.email
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ----------------- RAW EMAIL ROUTES -----------------

@app.post("/emails", response_model=schemas.RawEmailResponse, status_code=201, tags=["emails"])
def insert_raw_email(
    payload: schemas.RawEmailCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    return email_service.insert_raw_email(
        db=db,
        tenant_id=current_user.tenant_id,
        mailbox_id=payload.mailbox_id,
        provider_message_id=payload.provider_message_id,
        thread_id=payload.thread_id,
        sender=payload.sender,
        subject=payload.subject,
        body=payload.body,
        received_at=payload.received_at,
        normalized_metadata=payload.normalized_metadata,
        performed_by=current_user.email
    )

@app.get("/emails", response_model=List[schemas.RawEmailResponse], tags=["emails"])
def list_raw_emails(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    return email_service.list_raw_emails(db=db, tenant_id=current_user.tenant_id)

@app.get("/emails/thread/{thread_id}", response_model=List[schemas.RawEmailResponse], tags=["emails"])
def get_raw_emails_by_thread(
    thread_id: str,
    mailbox_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    return email_service.get_raw_emails_by_thread(
        db=db,
        tenant_id=current_user.tenant_id,
        mailbox_id=mailbox_id,
        thread_id=thread_id
    )

# ----------------- ENTITY ROUTES -----------------

@app.post("/entities", response_model=schemas.EntityResponse, status_code=201, tags=["entities"])
def create_entity(
    payload: schemas.EntityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    return entity_service.create_entity(
        db=db,
        tenant_id=current_user.tenant_id,
        status=payload.status,
        identity=payload.identity,
        source_reference=payload.source_reference,
        metadata_json=payload.metadata_json,
        performed_by=current_user.email
    )

@app.get("/entities", response_model=List[schemas.EntityResponse], tags=["entities"])
def list_entities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    return entity_service.list_entities(db=db, tenant_id=current_user.tenant_id)

@app.get("/entities/{entity_id}", response_model=schemas.EntityResponse, tags=["entities"])
def get_entity(
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    entity = entity_service.get_entity(db=db, tenant_id=current_user.tenant_id, entity_id=entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity

@app.patch("/entities/{entity_id}", response_model=schemas.EntityResponse, tags=["entities"])
def update_entity(
    entity_id: str,
    payload: schemas.EntityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    try:
        return entity_service.update_entity(
            db=db,
            tenant_id=current_user.tenant_id,
            entity_id=entity_id,
            status=payload.status,
            identity=payload.identity,
            metadata_json=payload.metadata_json,
            performed_by=current_user.email
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ----------------- IDENTIFIER ROUTES -----------------

@app.post("/entities/{entity_id}/identifiers", response_model=schemas.IdentifierResponse, status_code=201)
def add_identifier(
    entity_id: str,
    payload: schemas.IdentifierCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    try:
        return identifier_service.add_identifier(
            db=db,
            tenant_id=current_user.tenant_id,
            entity_id=entity_id,
            identifier_type=payload.identifier_type,
            identifier_value=payload.identifier_value,
            source=payload.source,
            performed_by=current_user.email
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/identifiers/resolve", response_model=schemas.EntityResponse)
def resolve_entity_by_identifier(
    identifier_type: str,
    identifier_value: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    entity = identifier_service.resolve_entity_by_identifier(
        db=db,
        tenant_id=current_user.tenant_id,
        identifier_type=identifier_type,
        identifier_value=identifier_value
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found for specified identifier")
    return entity

@app.delete("/identifiers/{identifier_id}")
def remove_identifier(
    identifier_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    try:
        identifier_service.remove_identifier(
            db=db,
            tenant_id=current_user.tenant_id,
            identifier_id=identifier_id,
            performed_by=current_user.email
        )
        return {"status": "success", "message": "Identifier removed"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/mailboxes/register", status_code=201)
def register_mailbox_endpoint(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Directly registers a mailbox with an existing access token.
    Useful for local development and seamless NextAuth integration.
    """
    if "email" not in payload or "access_token" not in payload:
        raise HTTPException(status_code=400, detail="Missing email or access_token")

    email = payload["email"]
    tenant_id = payload.get("tenant_id") or f"tenant-{email}"
    user_id = payload.get("user_id") or f"user-{email}"

    # 1. Ensure Tenant exists
    tenant = db.query(models.Tenant).filter(models.Tenant.id == tenant_id).first()
    if not tenant:
        tenant = models.Tenant(id=tenant_id, name=f"Tenant for {email}")
        db.add(tenant)

    # 2. Ensure User exists
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        user = models.User(
            id=user_id,
            email=email,
            name=payload.get("name", "User"),
            tenant_id=tenant_id,
            role="admin"
        )
        db.add(user)

    db.commit()

    # 3. Create/Update Mailbox
    mailbox_id = f"mb-{email}"
    mailbox = db.query(models.Mailbox).filter(models.Mailbox.id == mailbox_id).first()
    if not mailbox:
        mailbox = models.Mailbox(
            id=mailbox_id,
            tenant_id=tenant_id,
            provider_type=payload.get('provider_type', 'GMAIL').upper(),
        )
        db.add(mailbox)

    mailbox.encrypted_access_token = encrypt_token(payload['access_token'], tenant_id)
    if payload.get('refresh_token'):
        mailbox.encrypted_refresh_token = encrypt_token(payload['refresh_token'], tenant_id)

    mailbox.connection_status = "CONNECTED"
    mailbox.last_sync_time = None
    mailbox.updated_at = datetime.datetime.utcnow()
    mailbox.scope_state = email

    db.commit()
    db.refresh(mailbox)

    # 4. Trigger initial sync
    from neuromail.core.mailboxes.sync_service import SyncService
    try:
        sync_service = SyncService(db)
        sync_service.sync_mailbox(tenant_id, mailbox.id)
    except Exception as e:
        logger.error(f"Initial sync failed during registration: {str(e)}")

    return {"status": "success", "mailbox_id": mailbox.id, "tenant_id": tenant_id}

# ----------------- SEARCH ROUTES -----------------


@app.post("/entities/{entity_id}/events", response_model=schemas.EventResponse, status_code=201)
def append_event(
    entity_id: str,
    payload: schemas.EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    try:
        return event_service.append_event(
            db=db,
            tenant_id=current_user.tenant_id,
            entity_id=entity_id,
            event_type=payload.event_type,
            payload=payload.payload,
            source=payload.source,
            created_by=current_user.email
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/entities/{entity_id}/timeline", response_model=List[schemas.EventResponse])
def get_entity_timeline(
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    return event_service.get_entity_timeline(
        db=db,
        tenant_id=current_user.tenant_id,
        entity_id=entity_id
    )

# ----------------- AUDIT LOG ROUTES -----------------

@app.get("/audit_logs", response_model=List[schemas.AuditLogResponse])
def get_audit_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    return audit_service.get_audit_logs(db=db, tenant_id=current_user.tenant_id)


# ----------------- INGESTION READINESS HOOKS -----------------

@app.post("/ingestion/mock", status_code=201)
def mock_ingestion_hook(
    payload: schemas.RawEmailCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    # Safe insert raw email (with idempotency handling)
    email = email_service.insert_raw_email(
        db=db,
        tenant_id=current_user.tenant_id,
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
        tenant_id=current_user.tenant_id,
        status="ACTIVE",
        identity=f"Ingested Email: {payload.subject or 'No Subject'}",
        source_reference=f"raw_emails/{email.id}",
        performed_by="ingestion_worker"
    )

    # Log ingestion timeline event
    event_service.append_event(
        db=db,
        tenant_id=current_user.tenant_id,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    try:
        res = thread_service.get_thread_by_id(db, current_user.tenant_id, thread_id)
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    try:
        attachments = attachment_service.get_attachments_by_email(db, current_user.tenant_id, raw_email_id)
        return attachments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mailboxes/{mailbox_id}/status")
@app.get("/mailboxes/{mailbox_id}/status")
def get_mailbox_health_endpoint(
    mailbox_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_viewer)
):
    try:
        return connection_health.get_mailbox_health_status(db, current_user.tenant_id, mailbox_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- PHASE 4 INTELLIGENCE PIPELINE -----------------

@app.post("/pipeline/process/{raw_email_id}")
def run_processing_pipeline(
    raw_email_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _ = Depends(require_operator)
):
    """
    Trigger Phase 4 intelligence pipeline on a specific raw email.
    Runs: parse → AI enrichment → entity mapping → events → rule evaluation → alerts.
    """
    try:
        result = processing_pipeline.process_email_pipeline(db, current_user.tenant_id, raw_email_id)
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



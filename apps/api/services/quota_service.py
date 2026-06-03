import datetime
import uuid
import logging
from sqlalchemy.orm import Session
from models import TenantQuota, TenantQuotaUsage

logger = logging.getLogger("Services.QuotaService")

# Default values if no quota is explicitly defined
DEFAULT_MAX_EMAILS_PER_DAY = 10000
DEFAULT_MAX_LLM_TOKENS_PER_DAY = 100000
DEFAULT_MAX_RULES_PER_TENANT = 50

class QuotaExceededError(Exception):
    """Raised when a tenant's resource consumption exceeds their allocated quota."""
    pass

def get_or_create_quota(db: Session, tenant_id: str) -> TenantQuota:
    """
    Retrieves the TenantQuota settings for a tenant, or creates a default one if it doesn't exist.
    """
    quota = db.query(TenantQuota).filter(TenantQuota.tenant_id == tenant_id).first()
    if quota:
        return quota
        
    try:
        quota = TenantQuota(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            max_emails_per_day=DEFAULT_MAX_EMAILS_PER_DAY,
            max_llm_tokens_per_day=DEFAULT_MAX_LLM_TOKENS_PER_DAY,
            max_rules_per_tenant=DEFAULT_MAX_RULES_PER_TENANT,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow()
        )
        db.add(quota)
        db.commit()
        db.refresh(quota)
        return quota
    except Exception:
        db.rollback()
        quota = db.query(TenantQuota).filter(TenantQuota.tenant_id == tenant_id).first()
        return quota

def get_or_create_usage(db: Session, tenant_id: str, usage_date: datetime.date) -> TenantQuotaUsage:
    """
    Retrieves or creates (safely/idempotently) the TenantQuotaUsage record for a given date.
    """
    usage = db.query(TenantQuotaUsage).filter(
        TenantQuotaUsage.tenant_id == tenant_id,
        TenantQuotaUsage.usage_date == usage_date
    ).first()
    if usage:
        return usage
        
    try:
        usage = TenantQuotaUsage(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            usage_date=usage_date,
            emails_ingested=0,
            llm_tokens_used=0,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow()
        )
        db.add(usage)
        db.commit()
        db.refresh(usage)
        return usage
    except Exception:
        db.rollback()
        usage = db.query(TenantQuotaUsage).filter(
            TenantQuotaUsage.tenant_id == tenant_id,
            TenantQuotaUsage.usage_date == usage_date
        ).first()
        return usage

def check_email_quota(db: Session, tenant_id: str) -> bool:
    """
    Checks if the tenant is allowed to ingest another email today based on their quota.
    """
    quota = get_or_create_quota(db, tenant_id)
    today = datetime.date.today()
    usage = get_or_create_usage(db, tenant_id, today)
    
    if usage.emails_ingested >= quota.max_emails_per_day:
        logger.warning(f"Tenant {tenant_id} email quota exceeded: {usage.emails_ingested}/{quota.max_emails_per_day}")
        return False
    return True

def increment_email_count(db: Session, tenant_id: str, count: int = 1):
    """
    Increments the count of ingested emails for today.
    """
    today = datetime.date.today()
    usage = get_or_create_usage(db, tenant_id, today)
    usage.emails_ingested += count
    usage.updated_at = datetime.datetime.utcnow()
    db.commit()
    logger.info(f"Incremented emails_ingested for tenant {tenant_id} by {count}. Current: {usage.emails_ingested}")

def check_token_quota(db: Session, tenant_id: str) -> bool:
    """
    Checks if the tenant is allowed to use LLM tokens based on their quota.
    """
    quota = get_or_create_quota(db, tenant_id)
    today = datetime.date.today()
    usage = get_or_create_usage(db, tenant_id, today)
    
    if usage.llm_tokens_used >= quota.max_llm_tokens_per_day:
        logger.warning(f"Tenant {tenant_id} LLM token quota exceeded: {usage.llm_tokens_used}/{quota.max_llm_tokens_per_day}")
        return False
    return True

def increment_token_usage(db: Session, tenant_id: str, prompt_tokens: int, completion_tokens: int):
    """
    Increments the count of used LLM tokens for today.
    """
    total = prompt_tokens + completion_tokens
    today = datetime.date.today()
    usage = get_or_create_usage(db, tenant_id, today)
    usage.llm_tokens_used += total
    usage.updated_at = datetime.datetime.utcnow()
    db.commit()
    logger.info(f"Incremented token usage for tenant {tenant_id} by {total}. Current: {usage.llm_tokens_used}")

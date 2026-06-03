import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
import schemas
from models import TenantLLMConfig, TenantTokenUsage
from services.vault import encrypt_token
from neuromail.core.api.rbac import require_operator, require_viewer

router = APIRouter(prefix="/llm", tags=["LLM Configuration"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.post("/config", response_model=schemas.TenantLLMConfigResponse, status_code=201)
def configure_llm(
    payload: schemas.TenantLLMConfigCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    provider_lower = payload.provider.strip().lower()
    supported = ["openai", "anthropic", "gemini", "openrouter", "ollama", "mock"]
    if provider_lower not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported LLM provider: {payload.provider}")

    # Find existing config or create new
    config = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == tenant_id).first()
    
    encrypted_key = None
    if payload.api_key:
        encrypted_key = encrypt_token(payload.api_key)
        
    if config:
        config.provider = provider_lower
        config.model_name = payload.model_name
        if encrypted_key:
            config.encrypted_api_key = encrypted_key
        config.temperature = payload.temperature if payload.temperature is not None else 0.0
        config.max_tokens = payload.max_tokens if payload.max_tokens is not None else 1000
        config.auto_routing_enabled = payload.auto_routing_enabled if payload.auto_routing_enabled is not None else False
        config.updated_at = datetime.datetime.utcnow()
    else:
        config = TenantLLMConfig(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            provider=provider_lower,
            model_name=payload.model_name,
            encrypted_api_key=encrypted_key,
            temperature=payload.temperature if payload.temperature is not None else 0.0,
            max_tokens=payload.max_tokens if payload.max_tokens is not None else 1000,
            auto_routing_enabled=payload.auto_routing_enabled if payload.auto_routing_enabled is not None else False
        )
        db.add(config)

    db.commit()
    db.refresh(config)

    return schemas.TenantLLMConfigResponse(
        id=config.id,
        tenant_id=config.tenant_id,
        provider=config.provider,
        model_name=config.model_name,
        has_api_key=config.encrypted_api_key is not None,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        auto_routing_enabled=config.auto_routing_enabled,
        created_at=config.created_at,
        updated_at=config.updated_at
    )

@router.get("/config", response_model=schemas.TenantLLMConfigResponse)
def get_llm_config(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    config = db.query(TenantLLMConfig).filter(TenantLLMConfig.tenant_id == tenant_id).first()
    if not config:
        # Return fallback configuration representation
        import os
        return schemas.TenantLLMConfigResponse(
            id="system-default",
            tenant_id=tenant_id,
            provider=os.environ.get("DEFAULT_LLM_PROVIDER", "openai").lower(),
            model_name=os.environ.get("DEFAULT_LLM_MODEL", "gpt-4o"),
            has_api_key=True,
            temperature=0.0,
            max_tokens=1000,
            auto_routing_enabled=False,
            created_at=datetime.datetime.utcnow(),
            updated_at=datetime.datetime.utcnow()
        )
    return schemas.TenantLLMConfigResponse(
        id=config.id,
        tenant_id=config.tenant_id,
        provider=config.provider,
        model_name=config.model_name,
        has_api_key=config.encrypted_api_key is not None,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        auto_routing_enabled=config.auto_routing_enabled,
        created_at=config.created_at,
        updated_at=config.updated_at
    )

@router.get("/token-usage", response_model=List[schemas.TenantTokenUsageResponse])
def get_token_usages(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_viewer)
):
    usages = db.query(TenantTokenUsage).filter(
        TenantTokenUsage.tenant_id == tenant_id
    ).order_by(TenantTokenUsage.created_at.desc()).all()
    return usages

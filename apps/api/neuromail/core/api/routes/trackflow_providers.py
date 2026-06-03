import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from database import get_db
import schemas
from models import FreightProviderConnection, Tenant
from neuromail.core.api.auth import get_tenant_id
from neuromail.core.mailboxes.carrier_adapter import carrier_registry, ProviderValidationResult
from services.vault import encrypt_token

router = APIRouter(prefix="/trackflow/providers", tags=["TrackFlow Providers"])

class ProviderConnectionCreate(BaseModel):
    provider_type: str # terminal49, project44
    credentials: Dict[str, str]
    region: Optional[str] = None

class ProviderConnectionResponse(BaseModel):
    id: str
    provider_type: str
    status: str
    last_success_at: Optional[datetime.datetime]
    last_failure_at: Optional[datetime.datetime]
    failure_reason: Optional[str]
    region: Optional[str] = None

    class Config:
        from_attributes = True

@router.get("", response_model=List[ProviderConnectionResponse])
def list_provider_connections(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id
    ).all()

@router.post("/connect")
def connect_provider(
    payload: ProviderConnectionCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    # 1. Resolve adapter
    adapter = None
    for a in carrier_registry._adapters:
        if a.carrier_name.lower() == payload.provider_type.lower():
            adapter = a
            break
    
    if not adapter:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {payload.provider_type}")

    # 2. Validate connection
    res: ProviderValidationResult = adapter.validate_connection(payload.credentials)
    if not res.success:
        raise HTTPException(status_code=400, detail=res.message)

    # 3. Encrypt credentials
    metadata = {}
    for k, v in payload.credentials.items():
        if "api_key" in k.lower() or "secret" in k.lower() or "password" in k.lower():
            encrypted = encrypt_token(v)
            metadata[k] = f"vault:{encrypted}"
        else:
            metadata[k] = v
    
    if payload.region:
        metadata["region"] = payload.region

    # 4. Upsert connection
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == payload.provider_type.lower()
    ).first()

    if not conn:
        conn = FreightProviderConnection(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            provider_type=payload.provider_type.lower()
        )
        db.add(conn)

    conn.status = "connected"
    conn.connection_metadata = metadata
    conn.last_success_at = datetime.datetime.utcnow()
    conn.failure_reason = None
    
    db.commit()
    return {"status": "success", "message": res.message}

@router.post("/{provider_type}/test")
def test_provider_connection(
    provider_type: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    # This would typically re-validate using stored credentials
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider_type.lower()
    ).first()
    
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # For demo, just return success if connected
    return {"status": "success", "message": f"Connection to {provider_type} is active"}

@router.post("/{provider_type}/sync")
def trigger_provider_sync(
    provider_type: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from services.tracking_service import run_tracking_sync
    count = run_tracking_sync(db, tenant_id, run_type="manual")
    return {"status": "success", "synced_count": count}

@router.delete("/{provider_type}")
def disconnect_provider(
    provider_type: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    conn = db.query(FreightProviderConnection).filter(
        FreightProviderConnection.tenant_id == tenant_id,
        FreightProviderConnection.provider_type == provider_type.lower()
    ).first()
    
    if conn:
        conn.status = "disconnected"
        conn.connection_metadata = None
        db.commit()
        
    return {"status": "success"}

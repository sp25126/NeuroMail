import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import schemas
from models import ExportArtifact
from neuromail.core.api.rbac import require_analyst
from neuromail.core.raw_email.export_service import run_export_artifact

router = APIRouter(prefix="/exports", tags=["Exports"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

class ExportRequest(schemas.BaseModel):
    target_type: str  # 'EMAIL', 'ALERT', 'ENTITY', 'EVENT', 'AUDIT_LOG'
    export_format: str  # 'CSV', 'JSON', 'MARKDOWN'
    limit: Optional[int] = 1000

@router.post("", response_model=schemas.ExportArtifactResponse, status_code=201)
def start_export_job(
    payload: ExportRequest,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    target = payload.target_type.upper()
    fmt = payload.export_format.upper()
    
    ext = fmt.lower()
    if ext == "markdown":
        ext = "md"
        
    filename = f"export_{target.lower()}_{uuid.uuid4().hex[:8]}.{ext}"
    
    # Store temporary file path; run_export_artifact will write here
    artifact = ExportArtifact(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        export_type=fmt,
        filename=filename,
        file_path="",  # Filled by service
        status="PENDING"
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)

    # Run the export service synchronously
    artifact = run_export_artifact(db, artifact, target, payload.limit)
    return artifact

@router.get("/{export_id}", response_model=schemas.ExportArtifactResponse)
def get_export_status(
    export_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    artifact = db.query(ExportArtifact).filter(
        ExportArtifact.tenant_id == tenant_id,
        ExportArtifact.id == export_id
    ).first()
    if not artifact:
        raise HTTPException(status_code=404, detail="Export artifact not found")
    return artifact

import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import schemas
from models import ReportDefinition, ReportRun
from neuromail.core.api.rbac import require_analyst, require_admin
from neuromail.core.raw_email.report_engine import run_report_definition

router = APIRouter(prefix="/reports", tags=["Reports"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.post("/definitions", response_model=schemas.ReportDefinitionResponse, status_code=201)
def create_report_definition(
    payload: schemas.ReportDefinitionCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    definition = ReportDefinition(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=payload.name,
        description=payload.description,
        report_type=payload.report_type,
        config=payload.config,
        schedule=payload.schedule,
        is_active=payload.is_active if payload.is_active is not None else True
    )
    db.add(definition)
    db.commit()
    db.refresh(definition)
    return definition

@router.get("/definitions", response_model=List[schemas.ReportDefinitionResponse])
def list_report_definitions(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    return db.query(ReportDefinition).filter(ReportDefinition.tenant_id == tenant_id).all()

@router.post("/definitions/{definition_id}/run", response_model=schemas.ReportRunResponse, status_code=201)
def run_report_definition_endpoint(
    definition_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    definition = db.query(ReportDefinition).filter(
        ReportDefinition.tenant_id == tenant_id,
        ReportDefinition.id == definition_id
    ).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Report definition not found")

    # Create run record
    report_run = ReportRun(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        report_definition_id=definition.id,
        status="PENDING",
        parameters=definition.config
    )
    db.add(report_run)
    db.commit()
    db.refresh(report_run)

    # Run the report definition (generates data and markdown output)
    report_run = run_report_definition(db, report_run)
    return report_run

@router.get("/runs", response_model=List[schemas.ReportRunResponse])
def list_report_runs(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    return db.query(ReportRun).filter(ReportRun.tenant_id == tenant_id).all()

@router.get("/runs/{run_id}", response_model=schemas.ReportRunResponse)
def get_report_run(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_analyst)
):
    run = db.query(ReportRun).filter(
        ReportRun.tenant_id == tenant_id,
        ReportRun.id == run_id
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Report run not found")
    return run

@router.delete("/definitions/{definition_id}", status_code=200)
def delete_report_definition(
    definition_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_admin)
):
    definition = db.query(ReportDefinition).filter(
        ReportDefinition.tenant_id == tenant_id,
        ReportDefinition.id == definition_id
    ).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Report definition not found")
        
    db.delete(definition)
    db.commit()
    return {"status": "success", "message": "Report definition deleted"}

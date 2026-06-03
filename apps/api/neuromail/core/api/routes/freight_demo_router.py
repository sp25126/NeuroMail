import datetime
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import schemas
from models import (
    Tenant, FreightRawEmail, FreightShipment, FreightAlert, FreightReportRun, FreightJobFailure, FreightCopilotQuery
)
from neuromail.core.api.auth import get_current_tenant_id, get_current_user
from neuromail.core.api.rbac import require_freight_admin, require_freight_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/freight/demo", tags=["Freight Demo"])

def get_tenant_id(x_tenant_id: str = Depends(get_current_tenant_id)):
    return x_tenant_id

@router.get("/readiness", response_model=schemas.FreightDemoReadinessResponse)
def get_demo_readiness(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    notes = []
    score = 0
    
    # 1. Mailbox Check
    mailbox_ok = db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == tenant_id).first() is not None
    if mailbox_ok:
        score += 20
    else:
        notes.append("No freight emails ingested. Connect a mailbox or forward sample emails.")
        
    # 2. Sync Check
    sync_ok = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id).first() is not None
    if sync_ok:
        score += 20
    else:
        notes.append("No active shipments found. Run an initial sync.")
        
    # 3. Report Check
    report_ok = db.query(FreightReportRun).filter(FreightReportRun.tenant_id == tenant_id, FreightReportRun.status == "success").first() is not None
    if report_ok:
        score += 20
    else:
        notes.append("No successful report runs. Generate a weekly summary report.")
        
    # 4. Alert Check
    alert_ok = db.query(FreightAlert).filter(FreightAlert.tenant_id == tenant_id).first() is not None
    if alert_ok:
        score += 20
    else:
        notes.append("No alerts generated. Try inducing a delay scenario.")
        
    # 5. Quarantine Check
    quarantine_ok = db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == tenant_id, FreightRawEmail.parsing_status == "quarantined").first() is not None
    if quarantine_ok:
        score += 20
    else:
        notes.append("No quarantined emails. Demo might lack 'safety' storytelling.")

    return {
        "score": score,
        "mailbox_ok": mailbox_ok,
        "sync_ok": sync_ok,
        "report_ok": report_ok,
        "alert_ok": alert_ok,
        "quarantine_ok": quarantine_ok,
        "notes": notes,
        "is_ready": score >= 80
    }

@router.get("/checklist")
def get_demo_checklist(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    # Returns specific IDs for a curated walkthrough
    top_shipment = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id, FreightShipment.last_known_status == "delayed").first()
    if not top_shipment:
        top_shipment = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id).first()
        
    top_alert = db.query(FreightAlert).filter(FreightAlert.tenant_id == tenant_id, FreightAlert.status == "open").first()
    
    quarantined = db.query(FreightRawEmail).filter(FreightRawEmail.tenant_id == tenant_id, FreightRawEmail.parsing_status == "quarantined").first()
    
    return {
        "highlighted_shipment_id": top_shipment.id if top_shipment else None,
        "highlighted_alert_id": top_alert.id if top_alert else None,
        "quarantined_email_id": quarantined.id if quarantined else None,
        "has_data": top_shipment is not None
    }

@router.post("/queries", response_model=schemas.FreightCopilotQueryResponse)
def log_copilot_query(payload: schemas.CopilotQuestion, request: Request, tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    query = FreightCopilotQuery(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        user_id=current_user.id,
        query_text=payload.query,
        response_mode="deterministic",
        cited_object_refs=[]
    )
    db.add(query)
    db.commit()
    db.refresh(query)
    return query

@router.get("/queries", response_model=List[schemas.FreightCopilotQueryResponse])
def get_copilot_queries(tenant_id: str = Depends(get_tenant_id), db: Session = Depends(get_db), _ = Depends(require_freight_viewer)):
    return db.query(FreightCopilotQuery).filter(FreightCopilotQuery.tenant_id == tenant_id).order_by(FreightCopilotQuery.created_at.desc()).limit(50).all()

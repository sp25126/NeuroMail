import datetime
import logging
logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
import schemas
from models import (
    FreightShipment, FreightRawEmail, FreightCarrierSnapshot,
    FreightAlert, FreightReportRun, FreightReportSchedule,
    FreightTenantConfig, FreightEvent, TrackflowFieldProvenance
)

router = APIRouter(prefix="/freight", tags=["Freight"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("/shipments", response_model=List[schemas.FreightShipmentResponse])
def list_shipments(
    status: Optional[str] = None,
    carrier: Optional[str] = None,
    port: Optional[str] = None,
    eta_start: Optional[datetime.datetime] = None,
    eta_end: Optional[datetime.datetime] = None,
    no_update_hours: Optional[int] = None,
    page: int = 1,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    List freight shipments for the tenant with pagination and optional filters.
    """
    q = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id)
    
    if status:
        q = q.filter(FreightShipment.last_known_status == status)
    if carrier:
        q = q.filter(FreightShipment.carrier.ilike(f"%{carrier}%"))
    if port:
        q = q.filter((FreightShipment.origin_port.ilike(f"%{port}%")) | (FreightShipment.destination_port.ilike(f"%{port}%")))
    if eta_start:
        q = q.filter(FreightShipment.eta >= eta_start)
    if eta_end:
        q = q.filter(FreightShipment.eta <= eta_end)
    if no_update_hours:
        threshold = datetime.datetime.utcnow() - datetime.timedelta(hours=no_update_hours)
        q = q.filter(FreightShipment.updated_at <= threshold)
        
    shipments = q.order_by(FreightShipment.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return shipments

@router.get("/shipments/{shipment_id}", response_model=schemas.FreightShipmentDetailResponse)
def get_shipment(
    shipment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve details of a specific freight shipment including identifiers, extractions and events.
    """
    shipment = db.query(FreightShipment).filter(
        FreightShipment.id == shipment_id,
        FreightShipment.tenant_id == tenant_id
    ).first()
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
        
    # Sort events by created_at desc for cleaner timeline representation
    if shipment.events:
        shipment.events = sorted(shipment.events, key=lambda e: e.created_at, reverse=True)
        
    return shipment

@router.get("/quarantine", response_model=List[schemas.FreightRawEmailResponse])
def list_quarantine(
    page: int = 1,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Retrieve quarantined raw freight emails.
    """
    emails = db.query(FreightRawEmail).filter(
        FreightRawEmail.tenant_id == tenant_id,
        FreightRawEmail.parsing_status == "quarantined"
    ).order_by(FreightRawEmail.received_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return emails

@router.post("/ingest", status_code=status.HTTP_200_OK)
def trigger_ingest(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Manually trigger freight email intake.
    """
    from services.freight_service import freight_ingest_emails
    count = freight_ingest_emails(db, tenant_id)
    return {"status": "success", "ingested_count": count}

@router.post("/sync", status_code=status.HTTP_200_OK)
def trigger_tracking_sync(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Manually trigger tracking sync for all active shipments of the tenant.
    """
    from services.tracking_service import run_tracking_sync
    count = run_tracking_sync(db, tenant_id)
    return {"status": "success", "synced_count": count}

@router.post("/shipments/{shipment_id}/sync", status_code=status.HTTP_200_OK)
def trigger_single_shipment_sync(
    shipment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Manually trigger tracking sync for a single shipment.
    """
    shipment = db.query(FreightShipment).filter(
        FreightShipment.id == shipment_id,
        FreightShipment.tenant_id == tenant_id
    ).first()
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
        
    from services.tracking_service import sync_single_shipment
    res = sync_single_shipment(db, tenant_id, shipment)
    return {"status": "success", "result": res}

@router.get("/config", response_model=schemas.FreightTenantConfigResponse)
def get_freight_config(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from models import FreightTenantConfig
    import uuid
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    if not config:
        # Create default config if it doesn't exist
        config = FreightTenantConfig(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            sync_interval_minutes=30,
            no_update_threshold_hours=24,
            storage_risk_days=3,
            freight_subject_patterns=[],
            freight_from_addresses=[],
            active_carriers=[],
            notification_email_addresses=[],
            alert_severity_threshold="medium",
            ai_extraction_enabled=True,
            primary_ai_model="gpt-4o",
            fallback_ai_model="claude-3-5-sonnet",
            extraction_confidence_threshold=0.7,
            quarantine_threshold=0.3,
            max_email_body_chars_for_ai=8000
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/config", response_model=schemas.FreightTenantConfigResponse)
def update_freight_config(
    payload: schemas.FreightTenantConfigUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from models import FreightTenantConfig
    import uuid
    config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
    if not config:
        config = FreightTenantConfig(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            ai_extraction_enabled=True,
            primary_ai_model="gpt-4o",
            fallback_ai_model="claude-3-5-sonnet",
            extraction_confidence_threshold=0.7,
            quarantine_threshold=0.3,
            max_email_body_chars_for_ai=8000
        )
        db.add(config)
        
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, val)
        
    db.commit()
    db.refresh(config)
    return config

@router.post("/alerts/{alert_id}/acknowledge", status_code=status.HTTP_200_OK)
def acknowledge_freight_alert(
    alert_id: str,
    x_user_id: str = Header(default="system"),
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from services.alert_lifecycle import acknowledge_alert
    alert = acknowledge_alert(db, tenant_id, alert_id, actor=x_user_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "alert_status": alert.status}

@router.post("/alerts/{alert_id}/snooze", status_code=status.HTTP_200_OK)
def snooze_freight_alert(
    alert_id: str,
    snoozed_until: datetime.datetime,
    x_user_id: str = Header(default="system"),
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from services.alert_lifecycle import snooze_alert
    alert = snooze_alert(db, tenant_id, alert_id, actor=x_user_id, snoozed_until=snoozed_until)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "alert_status": alert.status}

@router.post("/alerts/{alert_id}/resolve", status_code=status.HTTP_200_OK)
def resolve_freight_alert(
    alert_id: str,
    x_user_id: str = Header(default="system"),
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from services.alert_lifecycle import resolve_alert
    alert = resolve_alert(db, tenant_id, alert_id, actor=x_user_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "alert_status": alert.status}


# --- PHASE 3 DASHBOARD, REPORTING & COPILOT ENDPOINTS ---

@router.get("/dashboard/summary", response_model=schemas.FreightDashboardSummaryResponse)
def get_freight_dashboard_summary(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Get freight status summary and historical trend deltas (vs 24 hours ago).
    """
    from services.freight_service import get_dashboard_summary
    return get_dashboard_summary(db, tenant_id)


@router.get("/dashboard/shipments", response_model=List[schemas.FreightShipmentResponse])
def get_freight_dashboard_shipments(
    carrier: Optional[str] = None,
    port: Optional[str] = None,
    status: Optional[str] = None,
    is_arrived: Optional[bool] = None,
    is_delayed: Optional[bool] = None,
    no_update_breached: Optional[bool] = None,
    page: int = 1,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    List freight shipments with advanced filtering and pagination.
    """
    from models import FreightCarrierSnapshot, FreightTenantConfig
    from sqlalchemy import or_
    
    q = db.query(FreightShipment).filter(FreightShipment.tenant_id == tenant_id)
    
    if carrier:
        q = q.filter(FreightShipment.carrier.ilike(f"%{carrier}%"))
    if port:
        q = q.filter((FreightShipment.origin_port.ilike(f"%{port}%")) | (FreightShipment.destination_port.ilike(f"%{port}%")))
    if status:
        q = q.filter(FreightShipment.last_known_status == status)
        
    if is_arrived is not None or is_delayed is not None:
        # Join snapshot to filter
        sub_snap = db.query(FreightCarrierSnapshot.shipment_id)
        if is_arrived is not None:
            sub_snap = sub_snap.filter(FreightCarrierSnapshot.is_arrived == is_arrived)
        if is_delayed is not None:
            sub_snap = sub_snap.filter(FreightCarrierSnapshot.is_delayed == is_delayed)
        q = q.filter(FreightShipment.id.in_(sub_snap.subquery()))
        
    if no_update_breached is not None:
        config = db.query(FreightTenantConfig).filter(FreightTenantConfig.tenant_id == tenant_id).first()
        threshold = config.no_update_threshold_hours if config else 24
        now = datetime.datetime.utcnow()
        limit_time = now - datetime.timedelta(hours=threshold)
        if no_update_breached:
            q = q.filter(
                FreightShipment.is_closed == False,
                or_(
                    FreightShipment.last_status_at == None,
                    FreightShipment.last_status_at <= limit_time
                )
            )
        else:
            q = q.filter(FreightShipment.last_status_at > limit_time)
            
    shipments = q.order_by(FreightShipment.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return shipments


@router.get("/dashboard/alerts", response_model=List[schemas.AlertResponse])
def get_freight_dashboard_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    rule_type: Optional[str] = None,
    shipment_id: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    List alerts with filters.
    """
    q = db.query(FreightAlert).filter(FreightAlert.tenant_id == tenant_id)
    if severity:
        q = q.filter(FreightAlert.severity == severity.lower())
    if status:
        q = q.filter(FreightAlert.status == status.lower())
    if rule_type:
        q = q.filter(FreightAlert.rule_type == rule_type)
    if shipment_id:
        q = q.filter(FreightAlert.shipment_id == shipment_id)
        
    alerts = q.order_by(FreightAlert.created_at.desc()).all()
    
    # Map to AlertResponse scheme (id, alert_type, message, severity, status, entity_id, created_at)
    res = []
    for a in alerts:
        res.append(schemas.AlertResponse(
            id=a.id,
            tenant_id=a.tenant_id,
            alert_type=a.rule_type,
            message=a.description,
            severity=a.severity.upper() if a.severity else "MEDIUM",
            status=a.status.upper() if a.status else "UNRESOLVED",
            created_at=a.created_at,
            updated_at=a.created_at,
            entity_id=a.shipment_id,
            occurrence_count=1
        ))
    return res


@router.get("/dashboard/quarantine", response_model=List[schemas.FreightRawEmailResponse])
def get_freight_dashboard_quarantine(
    page: int = 1,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    List quarantined emails.
    """
    return list_quarantine(page=page, limit=limit, tenant_id=tenant_id, db=db)


@router.get("/dashboard/reports", response_model=List[schemas.FreightReportRunResponse])
def get_freight_dashboard_reports(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Get past report run history.
    """
    from models import FreightReportRun
    runs = db.query(FreightReportRun).filter(
        FreightReportRun.tenant_id == tenant_id
    ).order_by(FreightReportRun.started_at.desc()).all()
    return runs


@router.get("/dashboard/shipments/{shipment_id}")
def get_freight_dashboard_shipment_detail(
    shipment_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Get complete shipment detail payload containing snapshots, alerts, raw emails, and timeline events.
    """
    shipment = db.query(FreightShipment).filter(
        FreightShipment.id == shipment_id,
        FreightShipment.tenant_id == tenant_id
    ).first()
    
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
        
    snapshots = db.query(FreightCarrierSnapshot).filter(
        FreightCarrierSnapshot.shipment_id == shipment_id,
        FreightCarrierSnapshot.tenant_id == tenant_id
    ).order_by(FreightCarrierSnapshot.synced_at.desc()).all()
    
    alerts = db.query(FreightAlert).filter(
        FreightAlert.shipment_id == shipment_id,
        FreightAlert.tenant_id == tenant_id
    ).order_by(FreightAlert.created_at.desc()).all()
    
    # Related raw emails through extraction logs
    from models import FreightEmailExtraction
    extractions = db.query(FreightEmailExtraction).filter(
        FreightEmailExtraction.shipment_id == shipment_id,
        FreightEmailExtraction.tenant_id == tenant_id
    ).all()
    
    email_ids = [e.raw_email_id for e in extractions]
    emails = db.query(FreightRawEmail).filter(
        FreightRawEmail.id.in_(email_ids),
        FreightRawEmail.tenant_id == tenant_id
    ).all() if email_ids else []
    
    # Sort events by created_at desc
    events = sorted(shipment.events or [], key=lambda e: e.created_at, reverse=True)

    # Retrieve field provenances
    provenances = db.query(TrackflowFieldProvenance).filter(
        TrackflowFieldProvenance.shipment_id == shipment_id,
        TrackflowFieldProvenance.tenant_id == tenant_id
    ).order_by(TrackflowFieldProvenance.created_at.asc()).all()
    
    return {
        "shipment": shipment,
        "identifiers": shipment.identifiers,
        "snapshots": snapshots,
        "alerts": alerts,
        "emails": emails,
        "events": events,
        "provenances": provenances
    }


@router.get("/reports/download/{run_id}")
def download_freight_report(
    run_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Serve generated report files with secure tenant boundary enforcement.
    """
    import os
    from fastapi.responses import FileResponse
    from models import FreightReportRun
    from services.report_service import REPORTS_DIR
    
    run = db.query(FreightReportRun).filter(
        FreightReportRun.id == run_id,
        FreightReportRun.tenant_id == tenant_id
    ).first()
    
    if not run or run.status != "success":
        raise HTTPException(status_code=404, detail="Report file not found or failed generation.")
        
    filename = f"report_{run.report_type}_{run.id}."
    # Find matching file in reports directory
    fmt = "csv"
    if run.output_uri and "xlsx" in run.output_uri:
        fmt = "xlsx"
        
    full_path = os.path.join(REPORTS_DIR, filename + fmt)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Physical report file not found on storage server.")
        
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if fmt == "xlsx" else "text/csv"
    return FileResponse(
        path=full_path,
        media_type=media_type,
        filename=os.path.basename(full_path)
    )


# --- REPORT SCHEDULE CRUD ---

@router.get("/reports/schedules", response_model=List[schemas.FreightReportScheduleResponse])
def get_freight_report_schedules(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from models import FreightReportSchedule
    return db.query(FreightReportSchedule).filter(FreightReportSchedule.tenant_id == tenant_id).all()


@router.post("/reports/schedules", response_model=schemas.FreightReportScheduleResponse, status_code=201)
def create_freight_report_schedule(
    payload: schemas.FreightReportScheduleCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    import uuid
    from models import FreightReportSchedule
    sched = FreightReportSchedule(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        report_type=payload.report_type,
        cron_expression=payload.cron_expression,
        interval_minutes=payload.interval_minutes,
        enabled=payload.enabled,
        format=payload.format,
        recipients=payload.recipients,
        created_at=datetime.datetime.utcnow()
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return sched


@router.put("/reports/schedules/{schedule_id}", response_model=schemas.FreightReportScheduleResponse)
def update_freight_report_schedule(
    schedule_id: str,
    payload: schemas.FreightReportScheduleUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from models import FreightReportSchedule
    sched = db.query(FreightReportSchedule).filter(
        FreightReportSchedule.id == schedule_id,
        FreightReportSchedule.tenant_id == tenant_id
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(sched, field, val)
        
    db.commit()
    db.refresh(sched)
    return sched


@router.delete("/reports/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_freight_report_schedule(
    schedule_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    from models import FreightReportSchedule
    sched = db.query(FreightReportSchedule).filter(
        FreightReportSchedule.id == schedule_id,
        FreightReportSchedule.tenant_id == tenant_id
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(sched)
    db.commit()


def get_user_id(x_user_id: str = Header(default="demo-admin")):
    return x_user_id

# --- READ-ONLY COPILOT ASSISTANT ---

@router.post("/copilot/chat", response_model=schemas.CopilotResponse)
def freight_copilot_chat(
    payload: schemas.FreightCopilotChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
    conversation_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Advanced freight copilot assistant. Can query live data, execute tools, and draft communications.
    """
    from neuromail.core.services.trackflow_copilot import TrackflowCopilotService
    service = TrackflowCopilotService(db)
    return service.handle_message(tenant_id, user_id, payload.message, conversation_id)


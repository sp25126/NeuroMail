import os
import csv
import uuid
import datetime
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from openpyxl import Workbook

from models import (
    FreightShipment,
    FreightShipmentIdentifier,
    FreightEvent,
    FreightCarrierSnapshot,
    FreightAlert,
    FreightRawEmail,
    FreightTenantConfig,
    FreightReportRun
)

# Base directory for local reports storage
REPORTS_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "reports"
    )
)

def ensure_reports_dir():
    os.makedirs(REPORTS_DIR, exist_ok=True)

def generate_report(
    db: Session,
    tenant_id: str,
    report_type: str,
    output_format: str,
    params: dict = None
) -> Tuple[List[Dict[str, Any]], str, int]:
    """
    Main reporting controller.
    Runs the query, formats the output, saves the file to REPORTS_DIR,
    records a FreightReportRun record, and returns (raw_rows, output_uri, row_count).
    """
    ensure_reports_dir()
    now = datetime.datetime.utcnow()
    params = params or {}
    
    # 1. Start report run auditor
    run_id = str(uuid.uuid4())
    run = FreightReportRun(
        id=run_id,
        tenant_id=tenant_id,
        report_type=report_type,
        status="running",
        parameters=params,
        started_at=now
    )
    db.add(run)
    db.commit()
    
    try:
        # 2. Build report data
        headers, rows, raw_data = build_report_data(db, tenant_id, report_type, now)
        row_count = len(rows)
        
        # 3. Format and save
        filename = f"report_{report_type}_{run_id}.{output_format.lower()}"
        file_path = os.path.join(REPORTS_DIR, filename)
        
        if output_format.upper() == "CSV":
            with open(file_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(rows)
            output_uri = f"/freight/reports/download/{run_id}"
            
        elif output_format.upper() == "XLSX":
            wb = Workbook()
            ws = wb.active
            ws.title = report_type[:30]  # Excel tab name limit is 31 chars
            ws.append(headers)
            for r in rows:
                # Standardize datetime values for Excel cell writing
                formatted_row = []
                for cell in r:
                    if isinstance(cell, datetime.datetime):
                        formatted_row.append(cell.strftime("%Y-%m-%d %H:%M:%S"))
                    else:
                        formatted_row.append(cell)
                ws.append(formatted_row)
            wb.save(file_path)
            output_uri = f"/freight/reports/download/{run_id}"
            
        else:  # JSON / API Response
            output_uri = None
            
        # Update run status to success
        run.status = "success"
        run.completed_at = datetime.datetime.utcnow()
        run.output_uri = output_uri
        run.row_count = row_count
        db.add(run)
        db.commit()
        
        return raw_data, output_uri, row_count
        
    except Exception as e:
        # Update run status to failed
        run.status = "failed"
        run.completed_at = datetime.datetime.utcnow()
        run.error = str(e)
        db.add(run)
        db.commit()
        raise e

def build_report_data(
    db: Session,
    tenant_id: str,
    report_type: str,
    now: datetime.datetime
) -> Tuple[List[str], List[List[Any]], List[Dict[str, Any]]]:
    """
    Executes database queries to extract and compile the requested report.
    Returns (headers, list of list rows, list of dict data).
    """
    # Fetch tenant configuration for thresholds
    config = db.query(FreightTenantConfig).filter(
        FreightTenantConfig.tenant_id == tenant_id
    ).first()
    
    no_update_threshold = config.no_update_threshold_hours if config else 24
    storage_risk_threshold_days = config.storage_risk_days if config else 3
    
    if report_type == "shipment_status":
        headers = [
            "shipment_id", "primary_reference", "carrier", "origin_port",
            "destination_port", "current_status", "eta", "last_status_at",
            "is_arrived", "is_delayed", "open_alert_count",
            "last_event_type", "last_event_at"
        ]
        
        shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id
        ).all()
        
        rows = []
        raw_data = []
        
        for s in shipments:
            # Join latest snapshot
            latest_snap = db.query(FreightCarrierSnapshot).filter(
                FreightCarrierSnapshot.shipment_id == s.id,
                FreightCarrierSnapshot.tenant_id == tenant_id
            ).order_by(FreightCarrierSnapshot.synced_at.desc()).first()
            
            is_arrived = latest_snap.is_arrived if latest_snap else False
            is_delayed = latest_snap.is_delayed if latest_snap else False
            
            # Count open alerts
            open_alerts = db.query(FreightAlert).filter(
                FreightAlert.shipment_id == s.id,
                FreightAlert.tenant_id == tenant_id,
                FreightAlert.status == "open"
            ).count()
            
            # Fetch last timeline event
            last_event = db.query(FreightEvent).filter(
                FreightEvent.shipment_id == s.id,
                FreightEvent.tenant_id == tenant_id
            ).order_by(FreightEvent.created_at.desc()).first()
            
            last_event_type = last_event.event_type if last_event else None
            last_event_at = last_event.created_at if last_event else None
            
            row = [
                s.id, s.primary_reference, s.carrier, s.origin_port,
                s.destination_port, s.last_known_status, s.eta, s.last_status_at,
                is_arrived, is_delayed, open_alerts,
                last_event_type, last_event_at
            ]
            rows.append(row)
            
            raw_data.append({
                "shipment_id": s.id,
                "primary_reference": s.primary_reference,
                "carrier": s.carrier,
                "origin_port": s.origin_port,
                "destination_port": s.destination_port,
                "current_status": s.last_known_status,
                "eta": s.eta.isoformat() if s.eta else None,
                "last_status_at": s.last_status_at.isoformat() if s.last_status_at else None,
                "is_arrived": is_arrived,
                "is_delayed": is_delayed,
                "open_alert_count": open_alerts,
                "last_event_type": last_event_type,
                "last_event_at": last_event_at.isoformat() if last_event_at else None
            })
            
        return headers, rows, raw_data
        
    elif report_type == "aging_no_update":
        headers = [
            "shipment_id", "reference", "carrier", "last_status_at",
            "hours_since_update", "no_update_breached", "storage_risk_flag"
        ]
        
        shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id,
            FreightShipment.is_closed == False
        ).all()
        
        rows = []
        raw_data = []
        
        for s in shipments:
            # Hours since last update calculation
            last_update = s.last_status_at or s.created_at or now
            delta = now - last_update
            hours_since_update = round(delta.total_seconds() / 3600.0, 1)
            
            no_update_breached = hours_since_update > no_update_threshold
            
            # Check storage risk flag
            latest_snap = db.query(FreightCarrierSnapshot).filter(
                FreightCarrierSnapshot.shipment_id == s.id,
                FreightCarrierSnapshot.tenant_id == tenant_id
            ).order_by(FreightCarrierSnapshot.synced_at.desc()).first()
            
            is_arrived = latest_snap.is_arrived if latest_snap else False
            status_upper = (s.last_known_status or "").upper()
            picked_up = any(term in status_upper for term in ["PICKED UP", "DELIVERED", "GATE_OUT", "GATEOUT"])
            
            storage_risk_flag = False
            if is_arrived and not picked_up:
                dwell_days = delta.days
                storage_risk_flag = dwell_days >= storage_risk_threshold_days
                
            row = [
                s.id, s.primary_reference, s.carrier, s.last_status_at,
                hours_since_update, no_update_breached, storage_risk_flag
            ]
            rows.append(row)
            
            raw_data.append({
                "shipment_id": s.id,
                "reference": s.primary_reference,
                "carrier": s.carrier,
                "last_status_at": s.last_status_at.isoformat() if s.last_status_at else None,
                "hours_since_update": hours_since_update,
                "no_update_breached": no_update_breached,
                "storage_risk_flag": storage_risk_flag
            })
            
        return headers, rows, raw_data
        
    elif report_type == "arrival_pickup":
        headers = [
            "shipment_id", "reference", "arrived_at", "picked_up_at",
            "storage_risk_days", "storage_risk_flag", "alerts_open"
        ]
        
        shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id
        ).all()
        
        rows = []
        raw_data = []
        
        for s in shipments:
            # 1. Fetch arrived_at (first snapshot marking is_arrived=True)
            first_arr = db.query(FreightCarrierSnapshot).filter(
                FreightCarrierSnapshot.shipment_id == s.id,
                FreightCarrierSnapshot.tenant_id == tenant_id,
                FreightCarrierSnapshot.is_arrived == True
            ).order_by(FreightCarrierSnapshot.synced_at.asc()).first()
            arrived_at = first_arr.synced_at if first_arr else None
            
            # 2. Fetch picked_up_at (event marking picked up)
            picked_event = db.query(FreightEvent).filter(
                FreightEvent.shipment_id == s.id,
                FreightEvent.tenant_id == tenant_id,
                FreightEvent.event_type == "field_updated"
            ).all()
            
            picked_up_at = None
            for e in picked_event:
                if e.payload and "milestone" in e.payload:
                    if e.payload["milestone"] in ["AVAILABLE_FOR_PICKUP", "GATE_OUT"]:
                        picked_up_at = e.created_at
                        break
                        
            # If no event, fallback to last_status_at if status indicates picked up
            status_upper = (s.last_known_status or "").upper()
            if not picked_up_at and any(term in status_upper for term in ["PICKED UP", "DELIVERED", "GATE_OUT", "GATEOUT"]):
                picked_up_at = s.last_status_at or s.updated_at
                
            # Count open alerts
            alerts_open = db.query(FreightAlert).filter(
                FreightAlert.shipment_id == s.id,
                FreightAlert.tenant_id == tenant_id,
                FreightAlert.status == "open"
            ).count()
            
            # Storage risk flag calculation
            storage_risk_flag = False
            if arrived_at and not picked_up_at:
                dwell_days = (now - arrived_at).days
                storage_risk_flag = dwell_days >= storage_risk_threshold_days
                
            row = [
                s.id, s.primary_reference, arrived_at, picked_up_at,
                storage_risk_threshold_days, storage_risk_flag, alerts_open
            ]
            rows.append(row)
            
            raw_data.append({
                "shipment_id": s.id,
                "reference": s.primary_reference,
                "arrived_at": arrived_at.isoformat() if arrived_at else None,
                "picked_up_at": picked_up_at.isoformat() if picked_up_at else None,
                "storage_risk_days": storage_risk_threshold_days,
                "storage_risk_flag": storage_risk_flag,
                "alerts_open": alerts_open
            })
            
        return headers, rows, raw_data
        
    elif report_type == "quarantine":
        headers = [
            "raw_email_id", "subject", "from_address", "received_at",
            "parsing_error", "quarantine_reason"
        ]
        
        emails = db.query(FreightRawEmail).filter(
            FreightRawEmail.tenant_id == tenant_id,
            FreightRawEmail.parsing_status == "quarantined"
        ).all()
        
        rows = []
        raw_data = []
        
        for e in emails:
            row = [
                e.id, e.subject, e.from_address, e.received_at,
                e.parsing_error, e.parsing_error or "quarantined"
            ]
            rows.append(row)
            
            raw_data.append({
                "raw_email_id": e.id,
                "subject": e.subject,
                "from_address": e.from_address,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "parsing_error": e.parsing_error,
                "quarantine_reason": e.parsing_error or "quarantined"
            })
            
        return headers, rows, raw_data
        
    elif report_type == "kpi_summary":
        headers = [
            "metric_name", "value"
        ]
        
        # 1. Total shipments count
        total_shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id
        ).count()
        
        # 2. Shipments arrived
        # Count shipments having an is_arrived=True snapshot
        sub_arrived = db.query(FreightCarrierSnapshot.shipment_id).filter(
            FreightCarrierSnapshot.tenant_id == tenant_id,
            FreightCarrierSnapshot.is_arrived == True
        ).subquery()
        
        shipments_arrived = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id,
            FreightShipment.id.in_(sub_arrived)
        ).count()
        
        # 3. Shipments delayed
        sub_delayed = db.query(FreightCarrierSnapshot.shipment_id).filter(
            FreightCarrierSnapshot.tenant_id == tenant_id,
            FreightCarrierSnapshot.is_delayed == True
        ).subquery()
        
        shipments_delayed = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id,
            FreightShipment.id.in_(sub_delayed)
        ).count()
        
        # 4. Shipments with no updates (breaching threshold)
        active_shipments = db.query(FreightShipment).filter(
            FreightShipment.tenant_id == tenant_id,
            FreightShipment.is_closed == False
        ).all()
        
        no_updates_count = 0
        total_dwell_hours = 0.0
        active_count = len(active_shipments)
        
        for s in active_shipments:
            last_update = s.last_status_at or s.created_at or now
            hours = (now - last_update).total_seconds() / 3600.0
            total_dwell_hours += hours
            if hours > no_update_threshold:
                no_updates_count += 1
                
        avg_hours = round(total_dwell_hours / active_count, 1) if active_count > 0 else 0.0
        
        # 5. Open alerts by severity
        alerts = db.query(FreightAlert).filter(
            FreightAlert.tenant_id == tenant_id,
            FreightAlert.status == "open"
        ).all()
        
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for a in alerts:
            sev = (a.severity or "medium").lower()
            if sev in severity_counts:
                severity_counts[sev] += 1
                
        # 6. Quarantine count
        quarantine_count = db.query(FreightRawEmail).filter(
            FreightRawEmail.tenant_id == tenant_id,
            FreightRawEmail.parsing_status == "quarantined"
        ).count()
        
        rows = [
            ["total_shipments", total_shipments],
            ["shipments_arrived", shipments_arrived],
            ["shipments_delayed", shipments_delayed],
            ["shipments_no_updates", no_updates_count],
            ["avg_hours_since_last_update", avg_hours],
            ["quarantine_count", quarantine_count],
            ["alerts_critical", severity_counts["critical"]],
            ["alerts_high", severity_counts["high"]],
            ["alerts_medium", severity_counts["medium"]],
            ["alerts_low", severity_counts["low"]]
        ]
        
        raw_data = [
            {"metric_name": r[0], "value": r[1]} for r in rows
        ]
        
        return headers, rows, raw_data
        
    else:
        raise ValueError(f"Unknown report type: {report_type}")

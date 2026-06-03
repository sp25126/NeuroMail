import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, Optional
from models import RawEmail, Alert, Entity, Event, ReportRun

def generate_report_data(
    db: Session,
    tenant_id: str,
    report_type: str,
    parameters: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Query the database to aggregate data and return structured JSON report metrics.
    """
    parameters = parameters or {}
    now = datetime.datetime.utcnow()
    
    # Parse date range
    days = int(parameters.get("days", 7))
    start_date = parameters.get("start_date")
    if start_date:
        if isinstance(start_date, str):
            start_dt = datetime.datetime.fromisoformat(start_date)
        else:
            start_dt = start_date
    else:
        start_dt = now - datetime.timedelta(days=days)
        
    end_date = parameters.get("end_date")
    if end_date:
        if isinstance(end_date, str):
            end_dt = datetime.datetime.fromisoformat(end_date)
        else:
            end_dt = end_date
    else:
        end_dt = now

    data = {
        "report_type": report_type,
        "tenant_id": tenant_id,
        "generated_at": now.isoformat(),
        "timeframe": {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat()
        }
    }

    if report_type in ("WEEKLY_SUMMARY", "CUSTOM", "DIGEST"):
        # Raw emails count
        email_count = db.query(RawEmail).filter(
            RawEmail.tenant_id == tenant_id,
            RawEmail.created_at >= start_dt,
            RawEmail.created_at <= end_dt
        ).count()
        
        # Alerts count
        alert_count = db.query(Alert).filter(
            Alert.tenant_id == tenant_id,
            Alert.created_at >= start_dt,
            Alert.created_at <= end_dt
        ).count()
        
        # Entities count
        entity_count = db.query(Entity).filter(
            Entity.tenant_id == tenant_id,
            Entity.created_at >= start_dt,
            Entity.created_at <= end_dt
        ).count()

        # Events count
        event_count = db.query(Event).filter(
            Event.tenant_id == tenant_id,
            Event.created_at >= start_dt,
            Event.created_at <= end_dt
        ).count()

        data["metrics"] = {
            "email_count": email_count,
            "alert_count": alert_count,
            "entity_count": entity_count,
            "event_count": event_count
        }

    elif report_type == "SLA_REPORT":
        # SLA Alert stats
        resolved_alerts = db.query(Alert).filter(
            Alert.tenant_id == tenant_id,
            Alert.status == "RESOLVED",
            Alert.created_at >= start_dt,
            Alert.created_at <= end_dt
        ).all()

        total_resolved = len(resolved_alerts)
        within_sla = 0
        total_resolution_time = 0.0

        for a in resolved_alerts:
            if a.resolved_at and a.created_at:
                diff = (a.resolved_at - a.created_at).total_seconds()
                total_resolution_time += diff
                # SLA target e.g. 24 hours (86400 seconds)
                if diff <= 86400:
                    within_sla += 1

        avg_resolution_time = (total_resolution_time / total_resolved) if total_resolved > 0 else 0.0
        sla_attainment_pct = (within_sla / total_resolved * 100.0) if total_resolved > 0 else 100.0

        data["metrics"] = {
            "total_resolved": total_resolved,
            "within_sla": within_sla,
            "sla_attainment_pct": round(sla_attainment_pct, 2),
            "avg_resolution_time_seconds": round(avg_resolution_time, 2)
        }

    elif report_type == "ALERT_VOLUME":
        # Group alerts by severity
        severity_counts = db.query(Alert.severity, func.count(Alert.id)).filter(
            Alert.tenant_id == tenant_id,
            Alert.created_at >= start_dt,
            Alert.created_at <= end_dt
        ).group_by(Alert.severity).all()

        # Group alerts by type
        type_counts = db.query(Alert.alert_type, func.count(Alert.id)).filter(
            Alert.tenant_id == tenant_id,
            Alert.created_at >= start_dt,
            Alert.created_at <= end_dt
        ).group_by(Alert.alert_type).all()

        data["metrics"] = {
            "by_severity": {r[0]: r[1] for r in severity_counts},
            "by_type": {r[0]: r[1] for r in type_counts}
        }

    elif report_type == "ENTITY_LIFECYCLE":
        # Group entities by status
        status_counts = db.query(Entity.status, func.count(Entity.id)).filter(
            Entity.tenant_id == tenant_id,
            Entity.created_at >= start_dt,
            Entity.created_at <= end_dt
        ).group_by(Entity.status).all()

        data["metrics"] = {
            "by_status": {r[0]: r[1] for r in status_counts}
        }

    else:
        # Default fallback
        data["metrics"] = {}

    return data

def generate_report_markdown(report_data: Dict[str, Any]) -> str:
    """
    Render reporting metrics to a human-readable markdown format.
    """
    report_type = report_data.get("report_type")
    tenant = report_data.get("tenant_id")
    generated = report_data.get("generated_at")
    tf_start = report_data.get("timeframe", {}).get("start")
    tf_end = report_data.get("timeframe", {}).get("end")

    md = f"# Neuromail Operational Report\n\n"
    md += f"- **Tenant:** {tenant}\n"
    md += f"- **Report Type:** {report_type}\n"
    md += f"- **Generated At:** {generated}\n"
    md += f"- **Timeframe:** {tf_start} to {tf_end}\n\n"
    md += f"---\n\n"

    metrics = report_data.get("metrics", {})

    if report_type in ("WEEKLY_SUMMARY", "CUSTOM"):
        md += "## Operational Summary\n\n"
        md += "| Metric | Count |\n"
        md += "| :--- | :--- |\n"
        md += f"| Emails Ingested | {metrics.get('email_count', 0)} |\n"
        md += f"| Entities Created | {metrics.get('entity_count', 0)} |\n"
        md += f"| Alerts Triggered | {metrics.get('alert_count', 0)} |\n"
        md += f"| System Events | {metrics.get('event_count', 0)} |\n"

    elif report_type == "SLA_REPORT":
        md += "## SLA & Response Latency Report\n\n"
        md += f"- **Total Alerts Resolved:** {metrics.get('total_resolved', 0)}\n"
        md += f"- **Resolved Within SLA (24h):** {metrics.get('within_sla', 0)}\n"
        md += f"- **SLA Attainment:** {metrics.get('sla_attainment_pct', 100.0)}%\n"
        avg_s = metrics.get('avg_resolution_time_seconds', 0.0)
        avg_h = round(avg_s / 3600.0, 2)
        md += f"- **Average Resolution Time:** {avg_s} seconds (~{avg_h} hours)\n"

    elif report_type == "ALERT_VOLUME":
        md += "## Alert Volume Analysis\n\n"
        md += "### Alerts by Severity\n\n"
        by_sev = metrics.get("by_severity", {})
        for sev, count in by_sev.items():
            md += f"- **{sev}:** {count}\n"
            
        md += "\n### Alerts by Type\n\n"
        by_type = metrics.get("by_type", {})
        for typ, count in by_type.items():
            md += f"- **{typ}:** {count}\n"

    elif report_type == "ENTITY_LIFECYCLE":
        md += "## Entity Lifecycle & Status Counts\n\n"
        by_status = metrics.get("by_status", {})
        for status, count in by_status.items():
            md += f"- **{status}:** {count}\n"

    else:
        md += "No metrics computed or unsupported report type."

    return md

def run_report_definition(db: Session, report_run: ReportRun) -> ReportRun:
    """
    Executes a report run, writing the results to report_run fields.
    """
    report_run.status = "RUNNING"
    db.commit()

    try:
        # Load definition to get config / type
        definition = report_run.report_definition
        if definition:
            report_type = definition.report_type
            params = {**definition.config, **(report_run.parameters or {})}
        else:
            report_type = report_run.parameters.get("report_type", "WEEKLY_SUMMARY")
            params = report_run.parameters or {}

        # Generate data
        output_data = generate_report_data(db, report_run.tenant_id, report_type, params)
        
        if report_type == "DIGEST":
            from services import ai_service
            timeframe = output_data.get("timeframe", {})
            start_dt = datetime.datetime.fromisoformat(timeframe["start"])
            end_dt = datetime.datetime.fromisoformat(timeframe["end"])
            
            digest_res = ai_service.generate_proactive_digest(db, report_run.tenant_id, start_dt, end_dt)
            output_data.update(digest_res)
            markdown_out = f"# {digest_res.get('headline', 'Operational Digest')}\n\n{digest_res.get('narrative_markdown', '')}"
        else:
            markdown_out = generate_report_markdown(output_data)

        # Update run record
        report_run.status = "COMPLETED"
        report_run.output_data = output_data
        report_run.human_output_markdown = markdown_out
        report_run.human_output_html = markdown_out.replace("\n", "<br>") # Simple conversion
        report_run.completed_at = datetime.datetime.utcnow()
        db.commit()
    except Exception as e:
        report_run.status = "FAILED"
        report_run.error_message = str(e)
        report_run.completed_at = datetime.datetime.utcnow()
        db.commit()
        
    return report_run

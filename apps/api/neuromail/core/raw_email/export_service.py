import os
import csv
import json
import datetime
import re
from typing import Any
from sqlalchemy.orm import Session
from models import ExportArtifact, RawEmail, Alert, Entity, Event, AuditLog

EXPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "exports")

def redact_sensitive_value(value: Any) -> Any:
    """
    Recursively scans and redacts credentials, keys, and tokens in any JSON or string structure.
    """
    if isinstance(value, str):
        # Look for patterns resembling access tokens, secret keys, password assignments, etc.
        patterns = [
            (r'(?i)(bearer\s+)[a-zA-Z0-9_\-\.\~]+', r'\1[REDACTED]'),
            (r'(?i)(token_ref=)[a-zA-Z0-9_\-\.]+', r'\1[REDACTED]'),
            (r'(?i)(access_token=)[a-zA-Z0-9_\-\.]+', r'\1[REDACTED]'),
            (r'(?i)(client_secret=)[a-zA-Z0-9_\-\.]+', r'\1[REDACTED]'),
            (r'(?i)(secret_key=)[a-zA-Z0-9_\-\.]+', r'\1[REDACTED]')
        ]
        redacted = value
        for pattern, replacement in patterns:
            redacted = re.sub(pattern, replacement, redacted)
        return redacted
    elif isinstance(value, dict):
        new_dict = {}
        for k, v in value.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ["token", "secret", "password", "key", "auth", "credentials"]):
                new_dict[k] = "[REDACTED]"
            else:
                new_dict[k] = redact_sensitive_value(v)
        return new_dict
    elif isinstance(value, list):
        return [redact_sensitive_value(item) for item in value]
    return value

def export_table_data(db: Session, tenant_id: str, target_type: str, export_format: str, limit: int = 1000) -> str:
    """
    Queries and exports table data for a tenant into a string payload.
    """
    target_type = target_type.upper()
    export_format = export_format.upper()

    if target_type == "EMAIL" or target_type == "RAW_EMAIL":
        records = db.query(RawEmail).filter(RawEmail.tenant_id == tenant_id).limit(limit).all()
        headers = ["id", "mailbox_id", "provider_message_id", "thread_id", "sender", "subject", "received_at"]
        rows = [[r.id, r.mailbox_id, r.provider_message_id, r.thread_id, r.sender, r.subject, r.received_at.isoformat() if r.received_at else ""] for r in records]
        raw_list = [{"id": r.id, "mailbox_id": r.mailbox_id, "provider_message_id": r.provider_message_id, "thread_id": r.thread_id, "sender": r.sender, "subject": r.subject, "received_at": r.received_at.isoformat() if r.received_at else ""} for r in records]

    elif target_type == "ALERT":
        records = db.query(Alert).filter(Alert.tenant_id == tenant_id).limit(limit).all()
        headers = ["id", "entity_id", "rule_id", "alert_type", "message", "status", "severity", "occurrence_count", "created_at"]
        rows = [[r.id, r.entity_id or "", r.rule_id or "", r.alert_type, r.message, r.status, r.severity, r.occurrence_count, r.created_at.isoformat()] for r in records]
        raw_list = [{"id": r.id, "entity_id": r.entity_id, "rule_id": r.rule_id, "alert_type": r.alert_type, "message": r.message, "status": r.status, "severity": r.severity, "occurrence_count": r.occurrence_count, "created_at": r.created_at.isoformat()} for r in records]

    elif target_type == "ENTITY":
        records = db.query(Entity).filter(Entity.tenant_id == tenant_id).limit(limit).all()
        headers = ["id", "status", "identity", "source_reference", "created_at", "updated_at"]
        rows = [[r.id, r.status, r.identity or "", r.source_reference or "", r.created_at.isoformat(), r.updated_at.isoformat()] for r in records]
        raw_list = [{"id": r.id, "status": r.status, "identity": r.identity, "source_reference": r.source_reference, "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat()} for r in records]

    elif target_type == "EVENT":
        records = db.query(Event).filter(Event.tenant_id == tenant_id).limit(limit).all()
        headers = ["id", "entity_id", "event_type", "source", "created_by", "created_at"]
        rows = [[r.id, r.entity_id, r.event_type, r.source, r.created_by or "", r.created_at.isoformat()] for r in records]
        raw_list = [{"id": r.id, "entity_id": r.entity_id, "event_type": r.event_type, "source": r.source, "created_by": r.created_by, "created_at": r.created_at.isoformat()} for r in records]

    elif target_type == "AUDIT_LOG":
        records = db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id).limit(limit).all()
        headers = ["id", "action", "performed_by", "object_type", "object_id", "changes", "created_at"]
        # Compliance requires redaction!
        rows = []
        raw_list = []
        for r in records:
            redacted_changes = redact_sensitive_value(r.changes)
            changes_str = json.dumps(redacted_changes) if redacted_changes else ""
            rows.append([r.id, r.action, r.performed_by, r.object_type, r.object_id, changes_str, r.created_at.isoformat()])
            raw_list.append({
                "id": r.id,
                "action": r.action,
                "performed_by": r.performed_by,
                "object_type": r.object_type,
                "object_id": r.object_id,
                "changes": redacted_changes,
                "created_at": r.created_at.isoformat()
            })

    else:
        raise ValueError(f"Unsupported target type for export: {target_type}")

    if export_format == "CSV":
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
        return output.getvalue()

    elif export_format == "JSON":
        return json.dumps(raw_list, indent=2)

    elif export_format == "MARKDOWN" or export_format == "MD":
        md = f"# Export of {target_type} Records\n\n"
        md += "| " + " | ".join(headers) + " |\n"
        md += "| " + " | ".join(["---"] * len(headers)) + " |\n"
        for row in rows:
            escaped_row = [str(val).replace("\n", " ").replace("|", "\\|") for val in row]
            md += "| " + " | ".join(escaped_row) + " |\n"
        return md
    
    else:
        raise ValueError(f"Unsupported export format: {export_format}")

def run_export_artifact(db: Session, export_artifact: ExportArtifact, target_type: str, limit: int = 1000) -> ExportArtifact:
    """
    Executes the export job, generates the file, and stores it in data/exports/.
    """
    export_artifact.status = "PENDING"
    db.commit()

    try:
        # Generate the data string
        payload = export_table_data(
            db=db,
            tenant_id=export_artifact.tenant_id,
            target_type=target_type,
            export_format=export_artifact.export_type,
            limit=limit
        )

        # Ensure export directory exists
        os.makedirs(EXPORT_DIR, exist_ok=True)
        
        # Save file to disk
        full_path = os.path.join(EXPORT_DIR, export_artifact.filename)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(payload)

        # Update export artifact record
        export_artifact.file_path = full_path
        export_artifact.status = "COMPLETED"
        db.commit()

    except Exception as e:
        export_artifact.status = "FAILED"
        export_artifact.error_message = str(e)
        db.commit()

    return export_artifact

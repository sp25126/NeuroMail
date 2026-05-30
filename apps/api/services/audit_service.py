import uuid
import datetime
from sqlalchemy.orm import Session
from models import AuditLog

def create_audit_log(db: Session, tenant_id: str, action: str, performed_by: str, object_type: str, object_id: str, changes: dict = None) -> AuditLog:
    masked_changes = {}
    if changes:
        sensitive_keys = {"token", "password", "token_ref", "encrypted_token", "body", "secret", "raw_token"}
        for k, v in changes.items():
            if k.lower() in sensitive_keys:
                masked_changes[k] = "[MASKED]"
            else:
                masked_changes[k] = v

    audit_entry = AuditLog(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        action=action,
        performed_by=performed_by,
        object_type=object_type,
        object_id=object_id,
        changes=masked_changes,
        created_at=datetime.datetime.utcnow()
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry

def get_audit_logs(db: Session, tenant_id: str):
    return db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.desc()).all()

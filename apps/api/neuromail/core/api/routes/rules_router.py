import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import schemas
from models import Rule
from services.audit_service import create_audit_log
from neuromail.core.api.rbac import require_operator

router = APIRouter(prefix="/rules", tags=["Rules"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.post("", response_model=schemas.RuleResponse, status_code=201)
def create_rule(
    payload: schemas.RuleCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    rule = Rule(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=payload.name,
        conditions=payload.conditions,
        outcome=payload.outcome,
        is_active=payload.is_active
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    
    # Audit log
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="CREATE_RULE",
        performed_by="user@example.com",
        object_type="RULE",
        object_id=rule.id,
        changes=payload.model_dump()
    )
    
    return rule

@router.get("", response_model=List[schemas.RuleResponse])
def list_rules(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return db.query(Rule).filter(Rule.tenant_id == tenant_id).all()

@router.delete("/{rule_id}", status_code=200)
def delete_rule(
    rule_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db),
    role: str = Depends(require_operator)
):
    rule = db.query(Rule).filter(Rule.tenant_id == tenant_id, Rule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    db.delete(rule)
    db.commit()
    
    create_audit_log(
        db=db,
        tenant_id=tenant_id,
        action="DELETE_RULE",
        performed_by="user@example.com",
        object_type="RULE",
        object_id=rule_id,
        changes={"deleted": True}
    )
    return {"status": "success", "message": "Rule deleted"}

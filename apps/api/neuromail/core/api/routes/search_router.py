import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
from database import get_db
from neuromail.core.raw_email import search_service

router = APIRouter(prefix="/search", tags=["Search & Filtering"])

def get_tenant_id(x_tenant_id: str = Header(default="demo-tenant")):
    return x_tenant_id

@router.get("")
def search(
    query: Optional[str] = None,
    types: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    # Parse object types list
    object_types = None
    if types:
        object_types = [t.strip().lower() for t in types.split(",") if t.strip()]
        
    # Parse dates
    parsed_start = None
    if start_date:
        try:
            parsed_start = datetime.datetime.fromisoformat(start_date.rstrip("Z"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Must be ISO-8601.")
            
    parsed_end = None
    if end_date:
        try:
            parsed_end = datetime.datetime.fromisoformat(end_date.rstrip("Z"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Must be ISO-8601.")

    try:
        return search_service.search_all_objects(
            db=db,
            tenant_id=tenant_id,
            query_str=query,
            object_types=object_types,
            start_date=parsed_start,
            end_date=parsed_end,
            status=status,
            severity=severity
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

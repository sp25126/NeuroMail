from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.orm import Session
from database import get_db
from models import Tenant, User
import logging
from neuromail.core.api import context

logger = logging.getLogger("API.Auth")

async def get_current_tenant_id(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    db: Session = Depends(get_db)
) -> str:
    """
    Dependency that validates the presence and existence of a tenant.
    Centralizes tenant isolation.
    """
    tenant = db.query(Tenant).filter(Tenant.id == x_tenant_id).first()
    if not tenant:
        logger.warning(f"Access attempted for non-existent tenant: {x_tenant_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found or inactive"
        )
    
    # Set context
    context.tenant_id.set(x_tenant_id)
    return x_tenant_id

async def get_current_user(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id),
    x_user_id: str = Header(..., alias="X-User-ID")
) -> User:
    """
    Dependency that validates the user exists within the given tenant scope.
    """
    user = db.query(User).filter(User.id == x_user_id, User.tenant_id == tenant_id).first()
    if not user:
        logger.warning(f"User {x_user_id} not found in tenant {tenant_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User identity invalid for this tenant scope"
        )
    
    # Set context
    context.user_id.set(x_user_id)
    context.user_role.set(user.role)
    return user

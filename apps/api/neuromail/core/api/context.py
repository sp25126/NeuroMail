from contextvars import ContextVar
from typing import Optional

tenant_id: ContextVar[Optional[str]] = ContextVar("tenant_id", default=None)
user_id: ContextVar[Optional[str]] = ContextVar("user_id", default=None)
user_role: ContextVar[Optional[str]] = ContextVar("user_role", default=None)

def get_tenant_id() -> Optional[str]:
    return tenant_id.get()

def get_user_id() -> Optional[str]:
    return user_id.get()

def get_user_role() -> Optional[str]:
    return user_role.get()

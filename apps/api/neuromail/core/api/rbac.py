from fastapi import HTTPException, status, Depends
from typing import List
from neuromail.core.api.auth import get_current_user
from models import User

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)):
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' does not have sufficient permissions. Required roles: {self.allowed_roles}"
            )
        return current_user

# RBAC roles: admin, operator, analyst, viewer.
# Common checkers
require_admin = RoleChecker(["admin", "freight_admin"])
require_operator = RoleChecker(["admin", "operator", "freight_admin", "freight_operator"])
require_analyst = RoleChecker(["admin", "operator", "analyst", "freight_admin", "freight_operator", "freight_analyst"])
require_viewer = RoleChecker(["admin", "operator", "analyst", "viewer", "freight_admin", "freight_operator", "freight_analyst", "freight_viewer"])

# Freight-specific roles
require_freight_admin = RoleChecker(["admin", "freight_admin"])
require_freight_operator = RoleChecker(["admin", "operator", "freight_admin", "freight_operator"])
require_freight_analyst = RoleChecker(["admin", "operator", "analyst", "freight_admin", "freight_operator", "freight_analyst"])
require_freight_viewer = RoleChecker(["admin", "operator", "analyst", "viewer", "freight_admin", "freight_operator", "freight_analyst", "freight_viewer"])


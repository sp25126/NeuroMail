from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List
import datetime

# Tenant / User info
class TenantScope(BaseModel):
    tenant_id: str

# Mailbox Schemas
class MailboxCreate(BaseModel):
    provider_type: str = Field(..., description="GMAIL or OUTLOOK")
    scope_state: Optional[str] = None
    raw_token: Optional[str] = None

class MailboxUpdateStatus(BaseModel):
    connection_status: str
    error_state: Optional[str] = None
    last_sync_time: Optional[datetime.datetime] = None

class MailboxResponse(BaseModel):
    id: str
    tenant_id: str
    provider_type: str
    connection_status: str
    last_sync_time: Optional[datetime.datetime] = None
    token_ref: Optional[str] = None
    scope_state: Optional[str] = None
    error_state: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Raw Email Schemas
class RawEmailCreate(BaseModel):
    mailbox_id: str
    provider_message_id: str
    thread_id: str
    sender: str
    subject: Optional[str] = None
    body: Optional[str] = None
    received_at: datetime.datetime
    normalized_metadata: Optional[Dict[str, Any]] = None

class RawEmailResponse(BaseModel):
    id: str
    tenant_id: str
    mailbox_id: str
    provider_message_id: str
    thread_id: str
    sender: str
    subject: Optional[str] = None
    body: Optional[str] = None
    received_at: datetime.datetime
    normalized_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Entity Schemas
class EntityCreate(BaseModel):
    status: str
    identity: Optional[str] = None
    source_reference: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None

class EntityUpdate(BaseModel):
    status: Optional[str] = None
    identity: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None

class EntityResponse(BaseModel):
    id: str
    tenant_id: str
    status: str
    identity: Optional[str] = None
    source_reference: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Identifier Schemas
class IdentifierCreate(BaseModel):
    identifier_type: str
    identifier_value: str
    source: str

class IdentifierResponse(BaseModel):
    id: str
    tenant_id: str
    entity_id: str
    identifier_type: str
    identifier_value: str
    source: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Event Schemas
class EventCreate(BaseModel):
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    source: Optional[str] = "SYSTEM"

class EventResponse(BaseModel):
    id: str
    tenant_id: str
    entity_id: str
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    source: str
    created_by: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Audit Log Response
class AuditLogResponse(BaseModel):
    id: str
    tenant_id: str
    action: str
    performed_by: str
    object_type: str
    object_id: str
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Attachment Schemas
class AttachmentCreate(BaseModel):
    filename: str
    content_type: str
    file_size: int

class AttachmentResponse(BaseModel):
    id: str
    tenant_id: str
    raw_email_id: str
    filename: str
    content_type: str
    file_size: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Rule Schemas
class RuleCreate(BaseModel):
    name: str
    conditions: Dict[str, Any]
    outcome: Dict[str, Any]
    is_active: Optional[bool] = True

class RuleResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    conditions: Dict[str, Any]
    outcome: Dict[str, Any]
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Alert Schemas
class AlertCreate(BaseModel):
    entity_id: Optional[str] = None
    alert_type: str
    message: str
    status: Optional[str] = "UNRESOLVED"
    severity: Optional[str] = "MEDIUM"

class AlertUpdate(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    assigned_to: Optional[str] = None
    snoozed_until: Optional[datetime.datetime] = None
    snooze_reason: Optional[str] = None

class AlertResponse(BaseModel):
    id: str
    tenant_id: str
    entity_id: Optional[str] = None
    rule_id: Optional[str] = None
    alert_type: str
    message: str
    status: str
    severity: str
    deduplication_key: Optional[str] = None
    snoozed_until: Optional[datetime.datetime] = None
    snooze_reason: Optional[str] = None
    resolved_at: Optional[datetime.datetime] = None
    acknowledged_at: Optional[datetime.datetime] = None
    assigned_to: Optional[str] = None
    occurrence_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Alert History Schemas
class AlertHistoryResponse(BaseModel):
    id: str
    tenant_id: str
    alert_id: str
    action: str
    performed_by: str
    performed_at: datetime.datetime
    reason: Optional[str] = None

    class Config:
        from_attributes = True

# Review Item Schemas
class ReviewItemResponse(BaseModel):
    id: str
    tenant_id: str
    object_type: str
    object_id: str
    status: str
    confidence_score: float
    reason: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class ReviewItemAction(BaseModel):
    action: str  # 'APPROVE' or 'REJECT'
    performed_by: str
    corrected_payload: Optional[Dict[str, Any]] = None

# AI Enrichment Schemas
class AIEnrichmentCacheResponse(BaseModel):
    id: str
    tenant_id: str
    raw_email_id: str
    summary: Optional[str] = None
    intent: Optional[str] = None
    urgency: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Notification Channel Schemas
class NotificationChannelCreate(BaseModel):
    channel_type: str  # 'SLACK', 'WEBHOOK', 'EMAIL'
    config: Dict[str, Any]
    is_active: Optional[bool] = True

class NotificationChannelResponse(BaseModel):
    id: str
    tenant_id: str
    channel_type: str
    config: Dict[str, Any]
    is_active: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True

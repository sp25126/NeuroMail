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

# Report Definition Schemas
class ReportDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    report_type: str  # 'WEEKLY_SUMMARY', 'SLA_REPORT', 'ALERT_VOLUME', 'ENTITY_LIFECYCLE', 'CUSTOM'
    config: Dict[str, Any]
    schedule: Optional[str] = None
    is_active: Optional[bool] = True

class ReportDefinitionResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str] = None
    report_type: str
    config: Dict[str, Any]
    schedule: Optional[str] = None
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Report Run Schemas
class ReportRunResponse(BaseModel):
    id: str
    tenant_id: str
    report_definition_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    human_output_markdown: Optional[str] = None
    human_output_html: Optional[str] = None
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

# Export Artifact Schemas
class ExportArtifactCreate(BaseModel):
    report_run_id: Optional[str] = None
    export_type: str  # 'CSV', 'JSON', 'MARKDOWN', 'HTML'
    filename: str
    file_path: str

class ExportArtifactResponse(BaseModel):
    id: str
    tenant_id: str
    report_run_id: Optional[str] = None
    export_type: str
    filename: str
    file_path: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Saved View Schemas
class SavedViewCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_type: str  # 'ALERT', 'ENTITY', 'EVENT', 'REPORT'
    filters: Dict[str, Any]
    is_default: Optional[bool] = False

class SavedViewResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str] = None
    target_type: str
    filters: Dict[str, Any]
    is_default: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Notification Preference Schemas
class NotificationPreferenceCreate(BaseModel):
    severity_threshold: Optional[str] = "LOW"  # 'LOW', 'MEDIUM', 'HIGH'
    digest_timing: Optional[str] = "IMMEDIATE"  # 'IMMEDIATE', 'DAILY', 'WEEKLY'
    enabled_channels: List[str]  # e.g., ["SLACK", "EMAIL"]
    mute_windows: Optional[List[Dict[str, Any]]] = None

class NotificationPreferenceResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    severity_threshold: str
    digest_timing: str
    enabled_channels: List[str]
    mute_windows: Optional[List[Dict[str, Any]]] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# User Role Update Schema
class UserUpdateRole(BaseModel):
    role: str

# LLM Configuration Schemas
class TenantLLMConfigCreate(BaseModel):
    provider: str = Field(..., description="'openai', 'anthropic', 'gemini', or 'mock'")
    model_name: str
    api_key: Optional[str] = None
    temperature: Optional[float] = 0.0
    max_tokens: Optional[int] = 1000
    auto_routing_enabled: Optional[bool] = False

class TenantLLMConfigResponse(BaseModel):
    id: str
    tenant_id: str
    provider: str
    model_name: str
    has_api_key: bool
    temperature: float
    max_tokens: int
    auto_routing_enabled: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Token Usage Schemas
class TenantTokenUsageResponse(BaseModel):
    id: str
    tenant_id: str
    provider: str
    model_name: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    feature_name: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Feedback Signal Schemas
class AIFeedbackSignalCreate(BaseModel):
    feature: str
    original_value: Dict[str, Any]
    corrected_value: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None

class AIFeedbackSignalResponse(BaseModel):
    id: str
    tenant_id: str
    feature: str
    original_value: Dict[str, Any]
    corrected_value: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Smart Alert Suggestions
class SmartSuggestionResponse(BaseModel):
    id: str
    tenant_id: str
    object_type: str
    object_id: str
    status: str
    confidence_score: float
    reason: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Response Drafting
class ResponseDraftCreate(BaseModel):
    mode: str = Field(..., description="'status_update', 'acknowledgment', 'escalation_notice', or 'follow_up_request'")

class ResponseDraftResponse(BaseModel):
    id: str
    tenant_id: str
    object_type: str
    object_id: str
    status: str
    confidence_score: float
    reason: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

# Ops Copilot
class CopilotQuestion(BaseModel):
    query: str

class CopilotCitation(BaseModel):
    record_type: str  # 'EMAIL', 'ALERT', 'ENTITY', 'EVENT'
    record_id: str
    reference: str

class CopilotResponse(BaseModel):
    answer: str
    citations: List[CopilotCitation]

# DLQ Response Schema
class DLQResponse(BaseModel):
    id: str
    tenant_id: str
    job_type: str
    payload: Dict[str, Any]
    error_message: Optional[str] = None
    retry_count: int
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

# Tenant Quota Schemas
class TenantQuotaResponse(BaseModel):
    id: str
    tenant_id: str
    max_emails_per_day: int
    max_llm_tokens_per_day: int
    max_rules_per_tenant: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class TenantQuotaUsageResponse(BaseModel):
    id: str
    tenant_id: str
    usage_date: datetime.date
    emails_ingested: int
    llm_tokens_used: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


# Freight Schemas
class FreightConfigResponse(BaseModel):
    id: str
    tenant_id: str
    subject_patterns: List[str]
    from_addresses: List[str]
    last_ingestion_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightRawEmailResponse(BaseModel):
    id: str
    tenant_id: str
    mailbox_id: str
    provider: str
    provider_message_id: str
    subject: Optional[str] = None
    from_address: str
    received_at: datetime.datetime
    raw_headers: Optional[Dict[str, Any]] = None
    raw_body: Optional[str] = None
    ingested_at: datetime.datetime
    parsing_status: str
    parsing_error: Optional[str] = None

    class Config:
        from_attributes = True

class FreightShipmentIdentifierResponse(BaseModel):
    id: str
    tenant_id: str
    shipment_id: str
    identifier_type: str
    identifier_value: str
    source: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightEmailExtractionResponse(BaseModel):
    id: str
    tenant_id: str
    raw_email_id: str
    shipment_id: Optional[str] = None
    extraction_status: str
    extracted_fields: Optional[Dict[str, Any]] = None
    confidence_score: float
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightEventResponse(BaseModel):
    id: str
    tenant_id: str
    shipment_id: Optional[str] = None
    event_type: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True

class FreightShipmentResponse(BaseModel):
    id: str
    tenant_id: str
    primary_reference: str
    carrier: Optional[str] = None
    origin_port: Optional[str] = None
    destination_port: Optional[str] = None
    eta: Optional[datetime.datetime] = None
    last_known_status: Optional[str] = None
    last_status_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    status_source: str
    is_closed: bool

    class Config:
        from_attributes = True

class TrackflowFieldProvenanceResponse(BaseModel):
    id: str
    tenant_id: str
    shipment_id: str
    raw_email_id: Optional[str] = None
    field_name: str
    field_value: Optional[str] = None
    extraction_method: str
    extraction_model: Optional[str] = None
    confidence: float
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class FreightShipmentDetailResponse(FreightShipmentResponse):
    identifiers: List[FreightShipmentIdentifierResponse] = []
    events: List[FreightEventResponse] = []
    extractions: List[FreightEmailExtractionResponse] = []
    provenances: List[TrackflowFieldProvenanceResponse] = []

    class Config:
        from_attributes = True


class FreightTenantConfigResponse(BaseModel):
    id: str
    tenant_id: str
    sync_interval_minutes: int
    no_update_threshold_hours: int
    storage_risk_days: int
    freight_subject_patterns: Optional[List[str]] = None
    freight_from_addresses: Optional[List[str]] = None
    active_carriers: Optional[List[str]] = None
    notification_email_addresses: Optional[List[str]] = None
    slack_webhook_url: Optional[str] = None
    external_webhook_url: Optional[str] = None
    alert_severity_threshold: str
    mute_start_hour: Optional[int] = None
    mute_end_hour: Optional[int] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    # AI Configurations
    ai_extraction_enabled: bool
    primary_ai_model: str
    fallback_ai_model: str
    extraction_confidence_threshold: float
    quarantine_threshold: float
    max_email_body_chars_for_ai: int

    class Config:
        from_attributes = True


class FreightTenantConfigUpdate(BaseModel):
    sync_interval_minutes: Optional[int] = None
    no_update_threshold_hours: Optional[int] = None
    storage_risk_days: Optional[int] = None
    freight_subject_patterns: Optional[List[str]] = None
    freight_from_addresses: Optional[List[str]] = None
    active_carriers: Optional[List[str]] = None
    notification_email_addresses: Optional[List[str]] = None
    slack_webhook_url: Optional[str] = None
    external_webhook_url: Optional[str] = None
    alert_severity_threshold: Optional[str] = None
    mute_start_hour: Optional[int] = None
    mute_end_hour: Optional[int] = None

    # AI Configurations
    ai_extraction_enabled: Optional[bool] = None
    primary_ai_model: Optional[str] = None
    fallback_ai_model: Optional[str] = None
    extraction_confidence_threshold: Optional[float] = None
    quarantine_threshold: Optional[float] = None
    max_email_body_chars_for_ai: Optional[int] = None


class FreightReportRunResponse(BaseModel):
    id: str
    tenant_id: str
    report_type: str
    status: str
    parameters: Optional[Dict[str, Any]] = None
    output_uri: Optional[str] = None
    row_count: int
    error: Optional[str] = None
    started_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class FreightReportScheduleResponse(BaseModel):
    id: str
    tenant_id: str
    report_type: str
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: bool
    format: str
    recipients: Optional[List[str]] = None
    last_run_at: Optional[datetime.datetime] = None
    next_run_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class FreightReportScheduleCreate(BaseModel):
    report_type: str
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: Optional[bool] = True
    format: Optional[str] = "csv"
    recipients: Optional[List[str]] = None


class FreightReportScheduleUpdate(BaseModel):
    report_type: Optional[str] = None
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = None
    enabled: Optional[bool] = None
    format: Optional[str] = None
    recipients: Optional[List[str]] = None


class FreightDashboardSummaryResponse(BaseModel):
    total_shipments: int
    shipments_arrived: int
    shipments_delayed: int
    shipments_no_update: int
    alerts_open_by_severity: Dict[str, int]
    quarantine_count: int
    avg_hours_since_update: float
    total_shipments_delta: int
    shipments_arrived_delta: int
    shipments_delayed_delta: int
    alerts_open_delta: int


class FreightCopilotChatRequest(BaseModel):
    message: str


class FreightCopilotChatResponse(BaseModel):
    response: str
    sources: List[Dict[str, Any]] = []


class FreightTenantOnboardingResponse(BaseModel):
    tenant_id: str
    step_mailbox_connected: bool
    step_outlook_connected: bool
    step_patterns_configured: bool
    step_carriers_configured: bool
    step_notifications_configured: bool
    step_ingestion_validated: bool
    step_sync_validated: bool
    completed_at: Optional[datetime.datetime] = None
    updated_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightApprovalResponse(BaseModel):
    id: str
    tenant_id: str
    approval_type: str
    target_id: str
    requested_by: str
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime.datetime] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightProviderConnectionCreate(BaseModel):
    connection_metadata: Optional[Dict[str, Any]] = None

class FreightProviderConnectionResponse(BaseModel):
    id: str
    tenant_id: str
    provider_type: str
    status: str
    last_success_at: Optional[datetime.datetime] = None
    last_failure_at: Optional[datetime.datetime] = None
    failure_reason: Optional[str] = None
    connection_metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class FreightJobFailureResponse(BaseModel):
    id: str
    tenant_id: str
    job_type: str
    target_id: str
    error_message: str
    stack_trace: Optional[str] = None
    status: str
    created_at: datetime.datetime
    resolved_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

class FreightSystemHealthSnapshotResponse(BaseModel):
    id: str
    tenant_id: str
    snapshot_type: str
    status: str
    metrics: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightAuditLogResponse(BaseModel):
    id: str
    tenant_id: str
    actor_type: str
    actor_id: str
    action: str
    target_type: str
    target_id: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime.datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True

class FreightCopilotQueryResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    query_text: str
    response_mode: str
    cited_object_refs: Optional[List[Dict[str, Any]]] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class FreightDemoReadinessResponse(BaseModel):
    score: int
    mailbox_ok: bool
    sync_ok: bool
    report_ok: bool
    alert_ok: bool
    quarantine_ok: bool
    notes: List[str]
    is_ready: bool


class ObjectRef(BaseModel):
    record_type: str # EMAIL, ALERT, SHIPMENT, REPORT, QUARANTINE, APPROVAL
    record_id: str
    reference: Optional[str] = None

class ApprovalRef(BaseModel):
    approval_id: str
    description: str

class ToolCallRecord(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    status: str # success, failed, approval_required, skipped
    result_summary: str
    object_refs: List[ObjectRef] = []

class CopilotResponse(BaseModel):
    response_text: str
    response_mode: str # deterministic, ai_assisted, fallback_unavailable
    cited_objects: List[ObjectRef]
    tool_calls: List[ToolCallRecord]
    approval_requests: List[ApprovalRef]




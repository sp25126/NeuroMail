from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, UniqueConstraint, Integer, Boolean, Float, Date
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    demo_featured = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    mailboxes = relationship("Mailbox", back_populates="tenant", cascade="all, delete-orphan")
    raw_emails = relationship("RawEmail", back_populates="tenant", cascade="all, delete-orphan")
    entities = relationship("Entity", back_populates="tenant", cascade="all, delete-orphan")
    identifiers = relationship("Identifier", back_populates="tenant", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="tenant", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="tenant", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="tenant", cascade="all, delete-orphan")
    rules = relationship("Rule", back_populates="tenant", cascade="all, delete-orphan")
    alert_histories = relationship("AlertHistory", back_populates="tenant", cascade="all, delete-orphan")
    review_items = relationship("ReviewItem", back_populates="tenant", cascade="all, delete-orphan")
    ai_enrichment_caches = relationship("AIEnrichmentCache", back_populates="tenant", cascade="all, delete-orphan")
    notification_channels = relationship("NotificationChannel", back_populates="tenant", cascade="all, delete-orphan")
    notification_logs = relationship("NotificationLog", back_populates="tenant", cascade="all, delete-orphan")
    report_definitions = relationship("ReportDefinition", back_populates="tenant", cascade="all, delete-orphan")
    report_runs = relationship("ReportRun", back_populates="tenant", cascade="all, delete-orphan")
    metric_snapshots = relationship("MetricSnapshot", back_populates="tenant", cascade="all, delete-orphan")
    export_artifacts = relationship("ExportArtifact", back_populates="tenant", cascade="all, delete-orphan")
    saved_views = relationship("SavedView", back_populates="tenant", cascade="all, delete-orphan")
    notification_preferences = relationship("NotificationPreference", back_populates="tenant", cascade="all, delete-orphan")
    llm_configs = relationship("TenantLLMConfig", back_populates="tenant", cascade="all, delete-orphan")
    token_usages = relationship("TenantTokenUsage", back_populates="tenant", cascade="all, delete-orphan")
    feedback_signals = relationship("AIFeedbackSignal", back_populates="tenant", cascade="all, delete-orphan")
    dead_letter_queues = relationship("DeadLetterQueue", back_populates="tenant", cascade="all, delete-orphan")
    quotas = relationship("TenantQuota", back_populates="tenant", cascade="all, delete-orphan")
    quota_usages = relationship("TenantQuotaUsage", back_populates="tenant", cascade="all, delete-orphan")
    parsed_emails = relationship("ParsedEmail", back_populates="tenant", cascade="all, delete-orphan")
    freight_configs = relationship("FreightConfig", back_populates="tenant", cascade="all, delete-orphan")
    freight_raw_emails = relationship("FreightRawEmail", back_populates="tenant", cascade="all, delete-orphan")
    freight_shipments = relationship("FreightShipment", back_populates="tenant", cascade="all, delete-orphan")
    freight_shipment_identifiers = relationship("FreightShipmentIdentifier", back_populates="tenant", cascade="all, delete-orphan")
    freight_email_extractions = relationship("FreightEmailExtraction", back_populates="tenant", cascade="all, delete-orphan")
    freight_events = relationship("FreightEvent", back_populates="tenant", cascade="all, delete-orphan")
    freight_carrier_snapshots = relationship("FreightCarrierSnapshot", back_populates="tenant", cascade="all, delete-orphan")
    freight_sync_runs = relationship("FreightSyncRun", back_populates="tenant", cascade="all, delete-orphan")
    freight_alerts = relationship("FreightAlert", back_populates="tenant", cascade="all, delete-orphan")
    freight_alert_events = relationship("FreightAlertEvent", back_populates="tenant", cascade="all, delete-orphan")
    freight_tenant_configs = relationship("FreightTenantConfig", back_populates="tenant", cascade="all, delete-orphan")
    freight_notification_logs = relationship("FreightNotificationLog", back_populates="tenant", cascade="all, delete-orphan")
    freight_report_runs = relationship("FreightReportRun", back_populates="tenant", cascade="all, delete-orphan")
    freight_report_schedules = relationship("FreightReportSchedule", back_populates="tenant", cascade="all, delete-orphan")
    freight_tenant_onboardings = relationship("FreightTenantOnboarding", back_populates="tenant", cascade="all, delete-orphan")
    freight_approvals = relationship("FreightApproval", back_populates="tenant", cascade="all, delete-orphan")
    freight_provider_connections = relationship("FreightProviderConnection", back_populates="tenant", cascade="all, delete-orphan")
    freight_job_failures = relationship("FreightJobFailure", back_populates="tenant", cascade="all, delete-orphan")
    freight_system_health_snapshots = relationship("FreightSystemHealthSnapshot", back_populates="tenant", cascade="all, delete-orphan")
    freight_audit_logs = relationship("FreightAuditLog", back_populates="tenant", cascade="all, delete-orphan")
    freight_copilot_queries = relationship("FreightCopilotQuery", back_populates="tenant", cascade="all, delete-orphan")
    mailbox_connections = relationship("MailboxConnection", back_populates="tenant", cascade="all, delete-orphan")
    trackflow_copilot_conversations = relationship("TrackflowCopilotConversation", back_populates="tenant", cascade="all, delete-orphan")
    trackflow_copilot_actions = relationship("TrackflowCopilotAction", back_populates="tenant", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, default="viewer", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")
    notification_preferences = relationship("NotificationPreference", back_populates="user", cascade="all, delete-orphan")

class Mailbox(Base):
    __tablename__ = "mailboxes"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    provider_type = Column(String, nullable=False)  # 'GMAIL', 'OUTLOOK'
    connection_status = Column(String, nullable=False, default="DISCONNECTED")  # 'CONNECTED', 'DISCONNECTED', 'ERROR'
    last_sync_time = Column(DateTime, nullable=True)
    token_ref = Column(String, nullable=True)  # References credentials stored elsewhere
    scope_state = Column(String, nullable=True)  # Scopes available
    error_state = Column(String, nullable=True)  # Error detail logs
    encrypted_access_token = Column(Text, nullable=True)
    encrypted_refresh_token = Column(Text, nullable=True)
    access_token_expires_at = Column(DateTime, nullable=True)
    last_history_id = Column(String, nullable=True)
    webhook_subscription_id = Column(String, nullable=True)
    webhook_subscription_expires_at = Column(DateTime, nullable=True)
    health_score = Column(Float, default=100.0, nullable=False)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    last_failure_reason = Column(Text, nullable=True)
    last_webhook_received_at = Column(DateTime, nullable=True)
    circuit_breaker_tripped = Column(Boolean, default=False, nullable=False)
    circuit_breaker_tripped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="mailboxes")
    raw_emails = relationship("RawEmail", back_populates="mailbox", cascade="all, delete-orphan")

class RawEmail(Base):
    __tablename__ = "raw_emails"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    mailbox_id = Column(String, ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False)
    provider_message_id = Column(String, index=True, nullable=False)
    thread_id = Column(String, index=True, nullable=False)
    sender = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    received_at = Column(DateTime, nullable=False)
    normalized_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="raw_emails")
    mailbox = relationship("Mailbox", back_populates="raw_emails")
    attachments = relationship("Attachment", back_populates="raw_email", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("mailbox_id", "provider_message_id", name="uq_mailbox_provider_message"),
    )

class Entity(Base):
    __tablename__ = "entities"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False)  # e.g., 'ACTIVE', 'COMPLETED', 'ARCHIVED'
    identity = Column(String, nullable=True)  # e.g., 'Shipment #1049'
    source_reference = Column(String, nullable=True)  # e.g., 'raw_emails/msg-id'
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="entities")
    identifiers = relationship("Identifier", back_populates="entity", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="entity", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="entity", cascade="all, delete-orphan")

class Identifier(Base):
    __tablename__ = "identifiers"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(String, ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    identifier_type = Column(String, nullable=False)  # e.g., 'BOL', 'TRACKING_NUMBER', 'CONTAINER_ID'
    identifier_value = Column(String, nullable=False)
    source = Column(String, nullable=False)  # e.g., 'EMAIL_PARSER'
    confidence = Column(Float, default=1.0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="identifiers")
    entity = relationship("Entity", back_populates="identifiers")

    __table_args__ = (
        UniqueConstraint("tenant_id", "identifier_type", "identifier_value", name="uq_tenant_identifier"),
    )

class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(String, ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)  # e.g., 'SHIPMENT_UPDATED', 'EMAIL_INGESTED'
    payload = Column(JSON, nullable=True)
    source = Column(String, nullable=False)  # e.g., 'SYSTEM', 'USER'
    created_by = Column(String, nullable=True)  # actor
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)  # Append-only

    tenant = relationship("Tenant", back_populates="events")
    entity = relationship("Entity", back_populates="events")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(String, ForeignKey("entities.id", ondelete="CASCADE"), nullable=True)
    rule_id = Column(String, ForeignKey("rules.id", ondelete="SET NULL"), nullable=True)
    alert_type = Column(String, nullable=False)  # e.g., 'DELAY', 'EXCEPTION'
    message = Column(String, nullable=False)
    status = Column(String, nullable=False, default="UNRESOLVED")  # 'UNRESOLVED', 'RESOLVED', 'SNOOZED', 'ACKNOWLEDGED'
    severity = Column(String, nullable=False, default="MEDIUM")
    deduplication_key = Column(String, nullable=True, index=True)
    snoozed_until = Column(DateTime, nullable=True)
    snooze_reason = Column(String, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    assigned_to = Column(String, nullable=True)
    occurrence_count = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="alerts")
    entity = relationship("Entity", back_populates="alerts")
    rule = relationship("Rule", back_populates="alerts")
    history_logs = relationship("AlertHistory", back_populates="alert", cascade="all, delete-orphan")
    notification_logs = relationship("NotificationLog", back_populates="alert", cascade="all, delete-orphan")

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    report_type = Column(String, nullable=False)
    data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="reports")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)  # e.g., 'CREATE_MAILBOX', 'UPDATE_ENTITY'
    performed_by = Column(String, nullable=False)  # actor email/id
    object_type = Column(String, nullable=False)  # e.g., 'MAILBOX', 'ENTITY'
    object_id = Column(String, nullable=False)
    changes = Column(JSON, nullable=True)  # audit diff (masked secrets)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="audit_logs")

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    raw_email_id = Column(String, ForeignKey("raw_emails.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="attachments")
    raw_email = relationship("RawEmail", back_populates="attachments")

class Rule(Base):
    __tablename__ = "rules"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    conditions = Column(JSON, nullable=False)
    outcome = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="rules")
    alerts = relationship("Alert", back_populates="rule")

class AlertHistory(Base):
    __tablename__ = "alert_histories"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    alert_id = Column(String, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)  # 'ACKNOWLEDGE', 'SNOOZE', 'RESOLVE', 'REOPEN', 'ESCALATE'
    performed_by = Column(String, nullable=False)
    performed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    reason = Column(String, nullable=True)

    tenant = relationship("Tenant", back_populates="alert_histories")
    alert = relationship("Alert", back_populates="history_logs")

class ReviewItem(Base):
    __tablename__ = "review_items"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    object_type = Column(String, nullable=False)  # 'RAW_EMAIL', 'ENTITY'
    object_id = Column(String, nullable=False)
    status = Column(String, default="PENDING", nullable=False)  # 'PENDING', 'APPROVED', 'REJECTED'
    confidence_score = Column(Float, nullable=False, default=1.0)
    reason = Column(String, nullable=True)
    payload = Column(JSON, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="review_items")

class AIEnrichmentCache(Base):
    __tablename__ = "ai_enrichment_caches"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    raw_email_id = Column(String, ForeignKey("raw_emails.id", ondelete="CASCADE"), nullable=False)
    summary = Column(Text, nullable=True)
    intent = Column(String, nullable=True)
    urgency = Column(String, nullable=True)
    urgency_score = Column(Integer, nullable=True)
    priority_label = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="ai_enrichment_caches")

class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    channel_type = Column(String, nullable=False)  # 'SLACK', 'WEBHOOK', 'EMAIL'
    config = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="notification_channels")
    notification_logs = relationship("NotificationLog", back_populates="channel", cascade="all, delete-orphan")

class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    alert_id = Column(String, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(String, ForeignKey("notification_channels.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False)  # 'SENT', 'FAILED', 'RETRYING'
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="notification_logs")
    alert = relationship("Alert", back_populates="notification_logs")
    channel = relationship("NotificationChannel", back_populates="notification_logs")

class ReportDefinition(Base):
    __tablename__ = "report_definitions"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    report_type = Column(String, nullable=False)  # 'WEEKLY_SUMMARY', 'SLA_REPORT', 'ALERT_VOLUME', 'ENTITY_LIFECYCLE', 'CUSTOM'
    config = Column(JSON, nullable=False)  # JSON filters/settings
    schedule = Column(String, nullable=True)  # cron string
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="report_definitions")
    report_runs = relationship("ReportRun", back_populates="report_definition", cascade="all, delete-orphan")

class ReportRun(Base):
    __tablename__ = "report_runs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_definition_id = Column(String, ForeignKey("report_definitions.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, default="PENDING", nullable=False)  # 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    error_message = Column(Text, nullable=True)
    parameters = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    human_output_markdown = Column(Text, nullable=True)
    human_output_html = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="report_runs")
    report_definition = relationship("ReportDefinition", back_populates="report_runs")
    export_artifacts = relationship("ExportArtifact", back_populates="report_run", cascade="all, delete-orphan")

class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    snapshot_time = Column(DateTime, nullable=False, index=True)
    metrics = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="metric_snapshots")

class ExportArtifact(Base):
    __tablename__ = "export_artifacts"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_run_id = Column(String, ForeignKey("report_runs.id", ondelete="SET NULL"), nullable=True)
    export_type = Column(String, nullable=False)  # 'CSV', 'JSON', 'MARKDOWN', 'HTML'
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, default="PENDING", nullable=False)  # 'PENDING', 'COMPLETED', 'FAILED'
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="export_artifacts")
    report_run = relationship("ReportRun", back_populates="export_artifacts")

class SavedView(Base):
    __tablename__ = "saved_views"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    target_type = Column(String, nullable=False)  # 'ALERT', 'ENTITY', 'EVENT', 'REPORT'
    filters = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="saved_views")

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    severity_threshold = Column(String, default="LOW", nullable=False)  # 'LOW', 'MEDIUM', 'HIGH'
    digest_timing = Column(String, default="IMMEDIATE", nullable=False)  # 'IMMEDIATE', 'DAILY', 'WEEKLY'
    enabled_channels = Column(JSON, nullable=False)  # e.g., ["SLACK", "EMAIL"]
    mute_windows = Column(JSON, nullable=True)  # e.g. [{"start": "22:00", "end": "06:00"}]
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="notification_preferences")
    user = relationship("User", back_populates="notification_preferences")

class TenantLLMConfig(Base):
    __tablename__ = "tenant_llm_configs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    provider = Column(String, nullable=False)  # 'openai', 'anthropic', 'gemini', 'mock'
    model_name = Column(String, nullable=False)
    encrypted_api_key = Column(Text, nullable=True)
    temperature = Column(Float, default=0.0, nullable=False)
    max_tokens = Column(Integer, default=1000, nullable=False)
    auto_routing_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="llm_configs")

class TenantTokenUsage(Base):
    __tablename__ = "tenant_token_usages"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String, nullable=False)
    model_name = Column(String, nullable=False)
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    feature_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="token_usages")

class AIFeedbackSignal(Base):
    __tablename__ = "ai_feedback_signals"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    feature = Column(String, nullable=False)  # 'classification', 'extraction', 'suggestion', etc.
    original_value = Column(JSON, nullable=False)
    corrected_value = Column(JSON, nullable=False)
    context = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="feedback_signals")

class DeadLetterQueue(Base):
    __tablename__ = "dead_letter_queue"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    job_type = Column(String, nullable=False)  # 'SYNC_MAILBOX', 'PROCESS_EMAIL', 'GENERATE_REPORT'
    payload = Column(JSON, nullable=False)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    status = Column(String, default="FAILED", nullable=False)  # 'FAILED', 'REPLAYED', 'DISMISSED'
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="dead_letter_queues")

class TenantQuota(Base):
    __tablename__ = "tenant_quotas"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    max_emails_per_day = Column(Integer, default=10000, nullable=False)
    max_llm_tokens_per_day = Column(Integer, default=100000, nullable=False)
    max_rules_per_tenant = Column(Integer, default=50, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="quotas")

class TenantQuotaUsage(Base):
    __tablename__ = "tenant_quota_usages"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    usage_date = Column(Date, nullable=False, index=True)
    emails_ingested = Column(Integer, default=0, nullable=False)
    llm_tokens_used = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="quota_usages")

    __table_args__ = (
        UniqueConstraint("tenant_id", "usage_date", name="uq_tenant_quota_usage_date"),
    )

class ParsedEmail(Base):
    __tablename__ = "parsed_emails"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    raw_email_id = Column(String, ForeignKey("raw_emails.id", ondelete="CASCADE"), nullable=False, unique=True)
    sender = Column(String, nullable=False)
    recipients = Column(JSON, nullable=False)
    cc = Column(JSON, nullable=True)
    bcc = Column(JSON, nullable=True)
    subject = Column(String, nullable=True)
    body_text = Column(Text, nullable=True)
    received_at = Column(DateTime, nullable=False)
    thread_id = Column(String, index=True, nullable=False)
    provider_message_id = Column(String, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="parsed_emails")
    raw_email = relationship("RawEmail")


class FreightConfig(Base):
    __tablename__ = "freight_configs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    subject_patterns = Column(JSON, nullable=False)
    from_addresses = Column(JSON, nullable=False)
    last_ingestion_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_configs")

class FreightRawEmail(Base):
    __tablename__ = "freight_raw_emails"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    mailbox_id = Column(String, ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String, nullable=False)
    provider_message_id = Column(String, index=True, nullable=False)
    subject = Column(String, nullable=True)
    from_address = Column(String, nullable=False)
    received_at = Column(DateTime, nullable=False)
    raw_headers = Column(JSON, nullable=True)
    raw_body = Column(Text, nullable=True)
    ingested_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    parsing_status = Column(String, nullable=False, default="pending")
    parsing_error = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_raw_emails")
    mailbox = relationship("Mailbox")
    extractions = relationship("FreightEmailExtraction", back_populates="raw_email", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", "provider_message_id", name="uq_freight_raw_email_message"),
    )

class FreightShipment(Base):
    __tablename__ = "freight_shipments"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    primary_reference = Column(String, index=True, nullable=False)
    carrier = Column(String, nullable=True)
    origin_port = Column(String, nullable=True)
    destination_port = Column(String, nullable=True)
    eta = Column(DateTime, nullable=True)
    last_known_status = Column(String, nullable=True)
    last_status_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    status_source = Column(String, nullable=False, default="email")
    is_closed = Column(Boolean, default=False, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_shipments")
    identifiers = relationship("FreightShipmentIdentifier", back_populates="shipment", cascade="all, delete-orphan")
    extractions = relationship("FreightEmailExtraction", back_populates="shipment", cascade="all, delete-orphan")
    events = relationship("FreightEvent", back_populates="shipment", cascade="all, delete-orphan")
    carrier_snapshots = relationship("FreightCarrierSnapshot", back_populates="shipment", cascade="all, delete-orphan")
    freight_alerts = relationship("FreightAlert", back_populates="shipment", cascade="all, delete-orphan")
    provenances = relationship("TrackflowFieldProvenance", back_populates="shipment", cascade="all, delete-orphan")
    tracking_bindings = relationship("ShipmentTrackingBinding", back_populates="shipment", cascade="all, delete-orphan")

class FreightShipmentIdentifier(Base):
    __tablename__ = "freight_shipment_identifiers"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=False)
    identifier_type = Column(String, nullable=False)
    identifier_value = Column(String, nullable=False)
    source = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_shipment_identifiers")
    shipment = relationship("FreightShipment", back_populates="identifiers")

    __table_args__ = (
        UniqueConstraint("tenant_id", "identifier_type", "identifier_value", name="uq_freight_shipment_identifier"),
    )

class FreightEmailExtraction(Base):
    __tablename__ = "freight_email_extractions"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    raw_email_id = Column(String, ForeignKey("freight_raw_emails.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="SET NULL"), nullable=True)
    extraction_status = Column(String, nullable=False)
    extracted_fields = Column(JSON, nullable=True)
    confidence_score = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_email_extractions")
    raw_email = relationship("FreightRawEmail", back_populates="extractions")
    shipment = relationship("FreightShipment", back_populates="extractions")

class FreightEvent(Base):
    __tablename__ = "freight_events"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_by = Column(String, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_events")
    shipment = relationship("FreightShipment", back_populates="events")


class FreightCarrierSnapshot(Base):
    __tablename__ = "freight_carrier_snapshots"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=False)
    carrier_adapter = Column(String, nullable=False)
    reference_used = Column(String, nullable=False)
    carrier_status = Column(String, nullable=False)
    location = Column(String, nullable=True)
    eta = Column(DateTime, nullable=True)
    vessel_name = Column(String, nullable=True)
    last_event = Column(String, nullable=True)
    last_event_at = Column(DateTime, nullable=True)
    is_arrived = Column(Boolean, default=False, nullable=False)
    is_delayed = Column(Boolean, default=False, nullable=False)
    raw_response = Column(JSON, nullable=True)
    synced_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_carrier_snapshots")
    shipment = relationship("FreightShipment", back_populates="carrier_snapshots")


class FreightSyncRun(Base):
    __tablename__ = "freight_sync_runs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    run_type = Column(String, nullable=False)  # 'scheduled', 'manual', 'retry'
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    total_shipments = Column(Integer, default=0, nullable=False)
    succeeded = Column(Integer, default=0, nullable=False)
    failed = Column(Integer, default=0, nullable=False)
    skipped = Column(Integer, default=0, nullable=False)
    errors = Column(JSON, nullable=True)  # list of {shipment_id, error}

    tenant = relationship("Tenant", back_populates="freight_sync_runs")


class FreightAlert(Base):
    __tablename__ = "freight_alerts"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=False)
    rule_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)  # critical, high, medium, low
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, default="open", nullable=False)  # open, acknowledged, snoozed, resolved, closed
    dedup_key = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    snoozed_until = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_alerts")
    shipment = relationship("FreightShipment", back_populates="freight_alerts")
    events = relationship("FreightAlertEvent", back_populates="alert", cascade="all, delete-orphan")


class FreightAlertEvent(Base):
    __tablename__ = "freight_alert_events"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    alert_id = Column(String, ForeignKey("freight_alerts.id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)  # created, acknowledged, snoozed, resolved, reopened, escalated
    actor = Column(String, nullable=False)  # user_id or 'system'
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_alert_events")
    alert = relationship("FreightAlert", back_populates="events")


class FreightTenantConfig(Base):
    __tablename__ = "freight_tenant_configs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    sync_interval_minutes = Column(Integer, default=30, nullable=False)
    no_update_threshold_hours = Column(Integer, default=24, nullable=False)
    storage_risk_days = Column(Integer, default=3, nullable=False)
    freight_subject_patterns = Column(JSON, nullable=True)
    freight_from_addresses = Column(JSON, nullable=True)
    active_carriers = Column(JSON, nullable=True)
    notification_email_addresses = Column(JSON, nullable=True)
    slack_webhook_url = Column(String, nullable=True)
    external_webhook_url = Column(String, nullable=True)
    alert_severity_threshold = Column(String, default="medium", nullable=False)
    mute_start_hour = Column(Integer, nullable=True)
    mute_end_hour = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Step 4 AI Extraction configurations
    ai_extraction_enabled = Column(Boolean, default=True, nullable=False)
    primary_ai_model = Column(String, default="gpt-4o", nullable=False)
    fallback_ai_model = Column(String, default="claude-3-5-sonnet", nullable=False)
    extraction_confidence_threshold = Column(Float, default=0.7, nullable=False)
    quarantine_threshold = Column(Float, default=0.3, nullable=False)
    max_email_body_chars_for_ai = Column(Integer, default=8000, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_tenant_configs")


class TrackflowFieldProvenance(Base):
    __tablename__ = "trackflow_field_provenance"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=False)
    raw_email_id = Column(String, ForeignKey("freight_raw_emails.id", ondelete="CASCADE"), nullable=True)
    field_name = Column(String, nullable=False)
    field_value = Column(String, nullable=True)
    extraction_method = Column(String, nullable=False)  # deterministic, ai_assisted, manual, carrier_api
    extraction_model = Column(String, nullable=True)
    confidence = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    shipment = relationship("FreightShipment", back_populates="provenances")
    raw_email = relationship("FreightRawEmail")


class FreightNotificationLog(Base):
    __tablename__ = "freight_notification_logs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    alert_id = Column(String, ForeignKey("freight_alerts.id", ondelete="CASCADE"), nullable=False)
    channel = Column(String, nullable=False)  # email, slack, webhook, internal
    destination = Column(String, nullable=True)
    status = Column(String, nullable=False)  # sent, failed, retrying
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_notification_logs")
    alert = relationship("FreightAlert")


class FreightReportRun(Base):
    __tablename__ = "freight_report_runs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_type = Column(String, nullable=False)
    status = Column(String, default="running", nullable=False)  # running, success, failed
    parameters = Column(JSON, nullable=True)
    output_uri = Column(String, nullable=True)
    row_count = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_report_runs")


class FreightReportSchedule(Base):
    __tablename__ = "freight_report_schedules"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_type = Column(String, nullable=False)
    cron_expression = Column(String, nullable=True)
    interval_minutes = Column(Integer, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    format = Column(String, default="csv", nullable=False)
    recipients = Column(JSON, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_report_schedules")

class FreightTenantOnboarding(Base):
    __tablename__ = "freight_tenant_onboarding"

    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    step_mailbox_connected = Column(Boolean, default=False, nullable=False)
    step_outlook_connected = Column(Boolean, default=False, nullable=False)
    step_patterns_configured = Column(Boolean, default=False, nullable=False)
    step_carriers_configured = Column(Boolean, default=False, nullable=False)
    step_notifications_configured = Column(Boolean, default=False, nullable=False)
    step_ingestion_validated = Column(Boolean, default=False, nullable=False)
    step_sync_validated = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_tenant_onboardings")

class FreightApproval(Base):
    __tablename__ = "freight_approvals"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    approval_type = Column(String, nullable=False) # email_send, webhook_dispatch, config_change, bulk_override
    target_id = Column(String, nullable=False)
    requested_by = Column(String, nullable=False)
    status = Column(String, default="pending", nullable=False) # pending, approved, rejected, expired
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_approvals")

class FreightProviderConnection(Base):
    __tablename__ = "freight_provider_connections"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    provider_type = Column(String, nullable=False) # gmail, outlook, project44, terminal49, custom_carrier
    status = Column(String, default="disconnected", nullable=False) # connected, degraded, disconnected, revoked, failed
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    failure_reason = Column(String, nullable=True)
    connection_metadata = Column(JSON, nullable=True) # encrypted tokens, etc.

    tenant = relationship("Tenant", back_populates="freight_provider_connections")

class ShipmentTrackingBinding(Base):
    __tablename__ = "shipment_tracking_bindings"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    shipment_id = Column(String, ForeignKey("freight_shipments.id", ondelete="CASCADE"), nullable=False)
    provider_name = Column(String, nullable=False) # terminal49, project44
    provider_tracking_id = Column(String, nullable=True)
    registration_status = Column(String, default="pending", nullable=False) # pending, registered, failed, not_supported
    identifier_type_used = Column(String, nullable=True)
    identifier_value_used = Column(String, nullable=True)
    last_registration_attempt_at = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    failure_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    shipment = relationship("FreightShipment", back_populates="tracking_bindings")

    __table_args__ = (
        UniqueConstraint("tenant_id", "shipment_id", "provider_name", name="uq_shipment_provider_binding"),
    )

class FreightJobFailure(Base):
    __tablename__ = "freight_job_failures"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    job_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    error_message = Column(String, nullable=False)
    stack_trace = Column(Text, nullable=True)
    status = Column(String, default="failed", nullable=False) # failed, retried, resolved
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_job_failures")

class FreightSystemHealthSnapshot(Base):
    __tablename__ = "freight_system_health_snapshots"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    snapshot_type = Column(String, nullable=False) # ingestion, sync, overall
    status = Column(String, nullable=False) # healthy, degraded, down
    metrics = Column(JSON, nullable=True) # queue depth, error rates
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_system_health_snapshots")

class FreightAuditLog(Base):
    __tablename__ = "freight_audit_logs"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    actor_type = Column(String, nullable=False) # user, system
    actor_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    tenant = relationship("Tenant", back_populates="freight_audit_logs")

class FreightCopilotQuery(Base):
    __tablename__ = "freight_copilot_queries"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    query_text = Column(Text, nullable=False)
    response_mode = Column(String, nullable=False) # deterministic, ai_assisted, fallback
    cited_object_refs = Column(JSON, nullable=True) # list of {type, id}
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="freight_copilot_queries")
    user = relationship("User")

class MailboxConnection(Base):
    __tablename__ = "mailbox_connections"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String, nullable=False) # 'gmail', 'outlook'
    email_address = Column(String, nullable=False)
    external_account_id = Column(String, nullable=True)
    status = Column(String, default="pending", nullable=False) # 'pending', 'connected', 'degraded', 'disconnected', 'revoked', 'failed'
    scopes = Column(JSON, nullable=True)
    access_token_encrypted = Column(Text, nullable=True)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    last_successful_sync_at = Column(DateTime, nullable=True)
    last_failed_sync_at = Column(DateTime, nullable=True)
    failure_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="mailbox_connections")

    def mark_connected(self):
        self.status = "connected"
        self.failure_reason = None
        self.updated_at = datetime.datetime.utcnow()

    def mark_failed(self, reason: str):
        self.status = "failed"
        self.failure_reason = reason
        self.last_failed_sync_at = datetime.datetime.utcnow()
        self.updated_at = datetime.datetime.utcnow()

    def mark_disconnected(self):
        self.status = "disconnected"
        self.updated_at = datetime.datetime.utcnow()

    def mark_degraded(self, reason: str):
        self.status = "degraded"
        self.failure_reason = reason
        self.updated_at = datetime.datetime.utcnow()

class TrackflowCopilotConversation(Base):
    __tablename__ = "trackflow_copilot_conversations"

    id = Column(String, primary_key=True, index=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="trackflow_copilot_conversations")
    user = relationship("User")
    messages = relationship("TrackflowCopilotMessage", back_populates="conversation", cascade="all, delete-orphan")

class TrackflowCopilotMessage(Base):
    __tablename__ = "trackflow_copilot_messages"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("trackflow_copilot_conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False) # user, assistant, tool
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    conversation = relationship("TrackflowCopilotConversation", back_populates="messages")

class TrackflowCopilotAction(Base):
    __tablename__ = "trackflow_copilot_actions"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("trackflow_copilot_conversations.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    intent = Column(String, nullable=True)
    response_mode = Column(String, nullable=False)
    tool_name = Column(String, nullable=True)
    tool_args = Column(JSON, nullable=True)
    status = Column(String, nullable=False) # success, failed, approval_required, skipped
    cited_refs = Column(JSON, nullable=True)
    approval_request_id = Column(String, ForeignKey("freight_approvals.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    conversation = relationship("TrackflowCopilotConversation")
    tenant = relationship("Tenant", back_populates="trackflow_copilot_actions")
    user = relationship("User")


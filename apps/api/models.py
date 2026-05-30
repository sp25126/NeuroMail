from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, UniqueConstraint, Integer, Boolean, Float
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
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

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")

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

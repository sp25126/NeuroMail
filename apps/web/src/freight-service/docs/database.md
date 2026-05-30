# Canonical Data Model (ERD) Specification

This document details the database schema design for the Neuromail Freight Module. The schema is optimized for multi-tenancy, high-performance tracking lookups, and auditability.

## 📊 Database Tables

### 1. `tenants`
Tracks separate tenant accounts to enforce database-level isolation.
- `id` (TEXT, PK): Unique tenant ID.
- `name` (TEXT): Tenant business name.
- `created_at` (TEXT): ISO timestamp.

### 2. `freight_mailboxes`
Stores mailbox authentication references and ingestion preferences.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK -> tenants)
- `provider_type` (TEXT): `GMAIL` or `OUTLOOK`.
- `connection_status` (TEXT): `CONNECTED`, `DISCONNECTED`, or `EXPIRED`.
- `last_sync_time` (TEXT)
- `mailbox_config` (TEXT): JSON configuration (filters, folder settings).
- `encrypted_token` (TEXT)
- `created_at` / `updated_at` (TEXT)

### 3. `raw_emails`
Stores raw email items for parsing. Ensures exact duplication prevention.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK)
- `mailbox_id` (TEXT, FK -> freight_mailboxes)
- `provider_message_id` (TEXT)
- `provider_thread_id` (TEXT)
- `sender` (TEXT)
- `subject` (TEXT)
- `body_preview` (TEXT)
- `processing_status` (TEXT): `PENDING`, `PROCESSED`, `FAILED`, `QUARANTINED`.
- `created_at` (TEXT)
- **Constraint**: `UNIQUE(tenant_id, mailbox_id, provider_message_id)`

### 4. `shipments`
The canonical shipping record.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK)
- `current_status` (TEXT): `IN_TRANSIT`, `ARRIVED_PORT`, `AVAILABLE_PICKUP`, `DELIVERED`, `CANCELLED`, `UNKNOWN`.
- `latest_eta` (TEXT)
- `origin` (TEXT)
- `destination` (TEXT)
- `last_free_day` (TEXT)
- `current_provider` (TEXT)
- `risk_flags` (TEXT): JSON array of active risks.
- `last_synced_time` (TEXT)
- `created_at` / `updated_at` (TEXT)

### 5. `shipment_identifiers`
Contains tracking keys linked to a shipment.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK)
- `shipment_id` (TEXT, FK -> shipments ON DELETE CASCADE)
- `identifier_type` (TEXT): `REFERENCE`, `BILL_OF_LADING`, `BOOKING_NUMBER`, `CONTAINER_NUMBER`, `TRACKING_ID`.
- `normalized_value` (TEXT)
- `original_value` (TEXT)
- `created_at` (TEXT)
- **Constraint**: `UNIQUE(tenant_id, identifier_type, normalized_value)`

### 6. `shipment_events`
Chronological milestone tracking records.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK)
- `shipment_id` (TEXT, FK -> shipments ON DELETE CASCADE)
- `source_provider` (TEXT)
- `source_event_key` (TEXT)
- `normalized_milestone` (TEXT)
- `raw_payload` (TEXT): JSON payload representation.
- `event_time` (TEXT)
- `recorded_time` (TEXT)

### 7. `alerts`
Events triggering operational attention.
- `id` (TEXT, PK)
- `tenant_id` (TEXT, FK)
- `shipment_id` (TEXT, FK -> shipments ON DELETE CASCADE)
- `alert_type` (TEXT): `PORT_ARRIVAL`, `AVAILABLE_PICKUP`, `DELAY`, `APPROACHING_LFD`, `NO_UPDATE`.
- `severity` (TEXT): `INFO`, `WARNING`, `CRITICAL`.
- `status` (TEXT): `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`, `FAILED`.
- `dedupe_key` (TEXT)
- `trigger_reason` (TEXT)
- `created_at` / `updated_at` (TEXT)
- **Constraint**: `UNIQUE(tenant_id, dedupe_key)`

---

## ⚡ Index Optimization Plan

1. **`idx_mailboxes_tenant`**: Fast listing of active integrations per client tenant.
2. **`idx_identifiers_lookup`**: Used for direct lookup matches when parsing inbound emails (`tenant_id, identifier_type, normalized_value`).
3. **`idx_raw_emails_tenant_mailbox`**: Fast deduplication and inbox verification sweeps.
4. **`idx_events_lookup`**: Sorts and resolves the shipment status chronology (`tenant_id, shipment_id, event_time`).

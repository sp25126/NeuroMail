# Mailbox Configuration and Discovery Specifications

This document outlines the `freight_mailboxes` database fields and describes the admin API contracts for managing mailbox connections.

## 💾 Schema Fields

The `freight_mailboxes` table supports:
- `id` (TEXT, PK): UUID.
- `tenant_id` (TEXT): Tenant reference.
- `provider_type` (TEXT): `GMAIL` or `OUTLOOK`.
- `connection_status` (TEXT): `CONNECTED`, `DISCONNECTED`, `EXPIRED`.
- `last_sync_time` (TEXT): ISO 8601 Timestamp.
- `mailbox_config` (TEXT): JSON containing rules like:
  ```json
  {
    "subject_patterns": ["shipment", "container", "booking"],
    "folder_names": ["Inbox", "Archive"]
  }
  ```
- `encrypted_token` (TEXT): Secure OAuth refresh reference credentials.

---

## 🔌 Admin API Contract

### 1. Create Mailbox
- **Route**: `POST /admin/freight/mailboxes`
- **Request Body**:
  ```json
  {
    "tenantId": "tenant-abc",
    "providerType": "GMAIL",
    "mailboxConfig": {
      "subject_patterns": ["shipment", "booking"],
      "folder_names": ["Inbox"]
    },
    "encryptedToken": "encrypted-token-value-here"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "id": "e18208b4-c857-4f7e-87b5-1ad04c6c9db2",
    "tenantId": "tenant-abc",
    "providerType": "GMAIL",
    "connectionStatus": "CONNECTED",
    "createdAt": "2026-05-28T09:00:00Z"
  }
  ```

### 2. List Mailboxes
- **Route**: `GET /admin/freight/mailboxes?tenantId=tenant-abc`
- **Response** (`200 OK`):
  ```json
  [
    {
      "id": "e18208b4-c857-4f7e-87b5-1ad04c6c9db2",
      "providerType": "GMAIL",
      "connectionStatus": "CONNECTED",
      "lastSyncTime": "2026-05-28T12:00:00Z"
    }
  ]
  ```

### 3. Update Mailbox Status
- **Route**: `PATCH /admin/freight/mailboxes/:id`
- **Request Body**:
  ```json
  {
    "connectionStatus": "DISCONNECTED"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "id": "e18208b4-c857-4f7e-87b5-1ad04c6c9db2",
    "connectionStatus": "DISCONNECTED",
    "updatedAt": "2026-05-28T12:30:00Z"
  }
  ```

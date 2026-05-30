# Phase 5 — Rules Engine, Reports, & MCP Specifications

This document outlines the operational rule engine schemas, reporting job flows, local S3 configurations, and AI MCP shipping tool schemas.

---

## ⚡ Rule Engine Design

Rules evaluate shipment events to trigger real-time alerts or actions:
- **Rule Layout (JSON)**:
  ```json
  {
    "id": "rule-port-arrival-alert",
    "name": "Port Arrival Notification",
    "conditions": {
      "milestone": "ARRIVAL",
      "status_stage": "ARRIVED_PORT"
    },
    "actions": [
      {
        "type": "email",
        "recipient": "ops-team@neuromail.local",
        "template": "arrival_notice_email"
      }
    ]
  }
  ```
- **Rules Evaluator Worker**:
  - Automatically runs after `shipment_events` are appended.
  - Reviews conditions and inserts matching notifications into the `alerts` database table (enforcing tenant scoping and deduplication).

---

## 📊 Report Generation Flow

Exports spreadsheet logs on a schedule or on-demand:
- **Report Job Runner**:
  - Fetches matching shipment records from the tenant's database partition.
  - Formats results into structured CSV or XLSX outputs.
  - Uploads the generated file to a local S3 storage bucket (supported via localstack compatibility).
  - Logs the metadata in `report_jobs` and `report_files` tables.

---

## 🤖 MCP Shipping Tool Specifications

Exposes secure operations for the AI copilot sidebar. Tools are tenant-scoped:

### 1. `shipping.listShipments`
Lists active cargo records.
- **Parameters**:
  - `limit` (optional integer)
  - `offset` (optional integer)
- **Response**: Array of shipments with current status, origin, destination, and active alerts.

### 2. `shipping.getShipment`
Returns comprehensive tracking details and event logs for a container.
- **Parameters**:
  - `shipmentId` (required string)
- **Response**: Detailed shipment entity including timeline events and risk flags.

### 3. `shipping.listAtRiskShipments`
Highlights delayed shipments or cargo approaching their Last Free Day (LFD).
- **Parameters**: None.
- **Response**: Filtered subset of active shipments where delay metrics or LFD boundaries are crossed.

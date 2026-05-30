# Neuromail Freight v1 Scope Document

This document defines the scope, requirements, user personas, boundaries, and acceptance criteria for Phase 0 and Phase 1 of the Neuromail Freight Module.

## 🎯 Target Customer Archetypes & Users
- **Operations Managers (Ops)**: Need real-time visibility on container status, cargo delays, and milestone tracking.
- **Supply Chain Planners**: Focus on ETA drift, Last Free Day (LFD) schedules to avoid demurrage/detention fees.
- **Freight Desk Operators**: Monitor carrier alerts, query shipment history, and generate reports.

---

## 📬 Inbound Mail Sources (v1)
1. **Gmail Integration**:
   - Synchronizes raw messages using Google Mail REST API.
   - Triggers near real-time updates via Gmail PubSub subscription (watching the `INBOX` label).
2. **Outlook / Microsoft Graph Integration**:
   - Fetching and tracking inbox emails using Microsoft Graph API endpoints.

---

## 🚢 Tracking Provider Strategy
- **Aggregator-First Approach**: Integration with **Project44** (aggregator platform) to handle multi-carrier milestones and unified tracking queries.
- **Direct Carrier Initial Coverage**: Dedicated tracking endpoints for:
  - **MSC (Mediterranean Shipping Company)**
  - **COSCO Shipping**

---

## ✨ Features (v1 Scope)
1. **Email Ingestion**: Scheduled discovery matching configured mailbox search parameters (`subject_patterns`, folders).
2. **Deterministic Parsing**: Rule-based regex extraction mapped from subject and body layouts.
3. **ISO 6346 Validation**: Check digit verification logic for container numbers to prevent processing dirty/corrupted data.
4. **Canonical Shipment Schema**: Tenant-safe Postgres storage tracking status, ETA, and LFD.
5. **Aggregated Status Sync**: F2 background tracking updates pulling from carrier adapters on a cadence.
6. **Basic Rules & Alerts Engine**: Triggers for:
   - Port Arrival
   - Available for Pickup
   - Last Free Day (LFD) Approach
7. **Reporting Outputs**: Exposing CSV and Excel (.xlsx) query logs.

---

## 🚫 Non-Goals
- **No Core UI Layout Changes**: The module integrates cleanly into the existing Next.js layout structure; there will be no redesign of the main three-pane client viewport.
- **No n8n Orchestration for Core Ingestion**: Worker scheduling, email intake, and parsing must run natively in the Node.js/TypeScript backend for performance, transaction isolation, and type-safety.

---

## ✅ Acceptance Checklist

| Requirement | Success Metric / Verification | Sign-off |
|---|---|---|
| Inbound Connectors | Verify Gmail and Outlook authenticate successfully and download message content | Product Owner |
| Deterministic Parsing | Ensure the 3 standard templates extract valid Container, Booking, and BOL values | QA Lead |
| Ingestion & Isolation | Verify separate database inserts enforce strict `tenant_id` boundaries | Tech Lead |
| Validation Logic | ISO 6346 validation successfully checks digit weights ($2^i$) | Tech Lead |

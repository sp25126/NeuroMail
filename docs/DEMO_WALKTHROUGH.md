# Neuromail Demo Walkthrough Checklist

This document outlines the steps for a repeatable, production-path identical demo of the Neuromail platform.

## Pre-requisites
- [ ] API server is running (`uv run uvicorn main:app --port 8000`)
- [ ] Demo data is seeded (`uv run python scripts/seed_demo.py`)

## 1. Foundation & Tenancy
- [ ] **Health Check:** `GET /health` returns status OK.
- [ ] **Readiness Check:** `GET /ready` returns status READY (verifies DB, Redis, and AI).
- [ ] **Isolation:** Attempt to access demo mailbox with an invalid `X-Tenant-ID` header. Verify `404 Not Found`.

## 2. Mailbox & Sync
- [ ] **List Mailboxes:** `GET /mailboxes` shows the seeded `demo-mailbox-gmail`.
- [ ] **Sync State:** Verify `connection_status` is `CONNECTED`.

## 3. Ingestion & Search
- [ ] **List Emails:** `GET /emails` shows seeded shipment and invoice emails.
- [ ] **Search:** `GET /search?q=BOL-44901` returns the delayed shipment email.

## 4. Intelligence & Alerts
- [ ] **List Rules:** `GET /rules` shows the "Urgent Shipment Exception" rule.
- [ ] **View Alerts:** `GET /alerts` shows a HIGH severity alert for the delayed shipment.
- [ ] **Entity Tracking:** `GET /entities` shows the tracked Shipment entity with its BOL identifier.

## 5. AI Triage
- [ ] **Summarization:** `GET /emails/{id}/summary` returns a structured AI summary of the delayed shipment.
- [ ] **Urgency Scoring:** `POST /emails/{id}/score` returns the calculated urgency score (1-5).

## 6. Dashboard & Ops
- [ ] **Metrics:** `GET /dashboard/metrics` shows updated counts for emails, alerts, and entities.
- [ ] **Audit Logs:** `GET /audit_logs` shows a trail of all demo actions (rule creation, alert generation, etc.).

## 7. Cleanup
- [ ] Stop the server.
- [ ] (Optional) Reset DB: `rm apps/api/test_run.db`

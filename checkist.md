TIER 1 — DEMO READY
The product must pass every test in this tier before it is shown to anyone outside the team.

D1 — Infrastructure sanity
Start the full stack from a clean state. Expected result: server boots cleanly on the configured port with no errors in logs.

Open /ready. Expected result: {"status":"ready","db":"ok","redis":"ok"}

Open /health. Expected result: all subsystem checks return healthy state.

Restart after killing Redis. Expected result: the app reports degraded, not healthy.

Restart after killing the database. Expected result: startup fails fast with a clear diagnostic message.

D2 — Tenant and user foundation
Create a demo tenant. Expected result: tenant is persisted and scoped correctly.

Create an admin user and a viewer user under the same tenant. Expected result: both users exist with correct roles.

Log in as each user. Expected result: JWT or session is returned and identity is correct.

Try accessing an admin route as the viewer. Expected result: 403 with a clean error.

Confirm that the demo tenant cannot see data from another tenant. Expected result: cross-tenant queries return empty or 404.

D3 — Mailbox connection
Connect a Gmail mailbox through OAuth. Expected result: mailbox record is created, token is stored encrypted, and status shows connected.

Connect an Outlook mailbox through OAuth. Expected result: same result as Gmail.

Open the mailbox list in the UI. Expected result: both mailboxes appear with correct provider icons and health status.

Disconnect one mailbox. Expected result: mailbox status updates and tokens are revoked or cleared safely.

D4 — Ingestion and raw email layer
Trigger a manual sync on the Gmail mailbox. Expected result: raw emails appear in the database and the UI shows the message count.

Trigger the same sync again. Expected result: no duplicate records are created.

Trigger a manual sync on the Outlook mailbox. Expected result: same result in the same raw email table.

Confirm both provider messages coexist cleanly. Expected result: provider field distinguishes records and both are tenant-scoped.

D5 — Parsing and entity extraction
Parse a raw email with a known identifier such as a shipment ID or order number. Expected result: parsed record is created with normalized fields and entity is extracted.

Parse an email with no recognizable entity. Expected result: parsed record is created but no entity is forced.

Confirm parsed fields are consistent for Gmail and Outlook messages. Expected result: output shape is identical regardless of provider.

Re-run parsing on the same raw email. Expected result: no duplicate parsed records are created.

D6 — Timeline and event display
Open the entity timeline for an extracted entity. Expected result: events appear in chronological order with source references.

Add a new email that references the same entity. Expected result: a new timeline event is appended without overwriting older events.

Open the thread view for a grouped conversation. Expected result: all messages in the thread are visible and grouped correctly.

D7 — Rules and alert demo path
Create a rule with a keyword condition. Expected result: rule is saved and visible in the rules list.

Send or inject an email that matches the rule. Expected result: an alert is created and appears in the alert list.

Send the same trigger again. Expected result: deduplication prevents a duplicate alert.

Acknowledge the alert in the UI. Expected result: alert status changes to acknowledged.

Resolve the alert. Expected result: alert is marked closed.

D8 — AI demo path
Open an email and trigger summarization. Expected result: a short AI summary appears with key action, entities, and urgency.

Confirm intent classification label appears on the email. Expected result: label is valid and within the defined set.

Confirm urgency score appears on the email. Expected result: score is between 1 and 5.

Open a stale entity and confirm a smart suggestion appears. Expected result: suggestion text describes the risk clearly.

Generate an AI response draft for an email. Expected result: draft is in pending-review state and is relevant to the email content.

Ask the ops copilot a natural language question about a known entity. Expected result: answer is grounded in real data and cites the source record.

D9 — Reports and dashboard
Open the main dashboard. Expected result: metric cards show correct counts for emails, alerts, entities, and open issues.

Generate a report for the current week. Expected result: report output includes entity counts, alert volumes, and trend data.

Export the report as CSV. Expected result: file downloads and data matches what is on screen.

Export the report as JSON. Expected result: schema is consistent with the CSV export.

D10 — Demo script flow
This is the single walkthrough a prospect would see. Run it end to end without touching configuration mid-demo.

Log in as admin.

Connect a Gmail mailbox.

Trigger a sync.

Open the inbox and confirm raw emails are visible.

Open one email and confirm AI summary, intent, and urgency score.

Open an entity extracted from that email and confirm the timeline.

Trigger a rule match and confirm alert creation.

Acknowledge and resolve the alert.

Ask the ops copilot a question about the entity.

Open the dashboard and confirm metrics updated.

Generate and export a weekly report.

Expected result: all 11 steps complete without a crash, a broken state, or a visible loading failure.

TIER 2 — PRODUCTION READY
The product must pass everything in Tier 1 plus every test in this tier before real tenants are onboarded.

P1 — Multi-tenant isolation
Create five tenants with separate mailboxes and data. Expected result: no tenant can see another's emails, entities, alerts, or reports.

Try injecting a tenant ID from a different tenant into an API request. Expected result: the request returns 403 or 404, never foreign data.

Confirm every database query in the codebase is scoped by tenant ID. Expected result: a query audit finds no unscoped reads on tenant-specific tables.

P2 — Authentication and token security
Confirm OAuth tokens are stored encrypted at rest. Expected result: raw token strings are not readable in the database directly.

Expire an access token and confirm refresh fires automatically before the next API call fails. Expected result: the user and system experience no interruption.

Revoke a refresh token externally and confirm the mailbox health updates to disconnected. Expected result: the system detects the revocation on the next sync attempt and marks the mailbox broken.

Confirm no token value appears in any application log. Expected result: log audit finds no raw token strings.

P3 — Data integrity under load
Run the ingestion pipeline with 1,000 mock emails for one tenant. Expected result: all 1,000 are stored with no duplicates and correct tenant scoping.

Re-run ingestion on the same 1,000 emails. Expected result: zero new records are created.

Run parsing and entity extraction on all 1,000. Expected result: pipeline completes and throughput is within acceptable latency.

Confirm no deadlocks or transaction failures occur during the run. Expected result: worker logs show clean completion.

P4 — Worker reliability and retries
Kill a worker mid-job. Expected result: the job is retried and completes correctly on restart.

Simulate a provider API 429 during sync. Expected result: rate limiter backs off, retries, and succeeds or logs clearly after max retries.

Simulate a persistent provider outage. Expected result: worker logs the failure, updates mailbox health, and does not loop aggressively.

Confirm that retry behavior is visible in the ops dashboard. Expected result: retry counts and failure states are surfaced.

P5 — Webhook reliability
Send 100 Gmail Pub/Sub notifications for the same message. Expected result: only one raw email record is created.

Send a malformed webhook payload. Expected result: endpoint rejects it safely with no crash or data corruption.

Confirm webhook endpoint validates signatures where required. Expected result: unsigned requests are rejected.

Expire and renew an Outlook webhook subscription. Expected result: renewal happens before expiry and notifications continue uninterrupted.

P6 — Rule and alert correctness
Define 10 rules with varying conditions across different tenants. Expected result: each rule only evaluates for its own tenant.

Create a rule that matches thousands of emails. Expected result: only the first distinct alert is created and deduplication prevents the rest.

Confirm alert lifecycle transitions are fully audited. Expected result: every state change has actor, timestamp, and reason.

Confirm human review queue correctly catches low-confidence results. Expected result: ambiguous items are routed before any alert or entity is promoted.

P7 — AI reliability and safety
Disable the LLM provider and confirm ingestion and parsing still work. Expected result: AI enrichment fails gracefully and does not block core pipeline.

Confirm no AI response ever auto-dispatches as an email without human approval. Expected result: all drafts are in pending-review state permanently until explicitly approved.

Confirm no AI response leaks data from one tenant into another. Expected result: context windows are tenant-scoped and copilot answers are bounded.

Confirm token usage is tracked accurately per tenant. Expected result: token counts in the database match provider billing records.

P8 — Reports and exports under real conditions
Generate a report for a tenant with 1,000 entities and 500 alerts. Expected result: report generates within an acceptable time and is correct.

Schedule the report and confirm the worker runs it on time. Expected result: run record exists and artifact is stored.

Export a large dataset asynchronously. Expected result: the export job runs in the background and the file is available for download when complete.

Confirm compliance exports do not include raw token values or sensitive secrets. Expected result: a privacy audit of the export file finds no sensitive strings.

P9 — RBAC edge cases
Try every sensitive action as every role. Expected result: only permitted roles can complete each action.

Confirm that API and UI enforce the same permissions. Expected result: a viewer cannot call a restricted API endpoint directly even with a valid token.

Escalate a user role and confirm new permissions take effect immediately. Expected result: no stale permission cache allows the old role to persist.

Remove a user and confirm their token is invalidated. Expected result: subsequent API calls with their token return 401.

P10 — Observability and alerting
Confirm metrics are emitted for ingestion throughput, parsing latency, rule hit rate, alert creation rate, and AI enrichment latency. Expected result: all metrics are queryable from the observability layer.

Trigger a pipeline failure and confirm an internal alert fires. Expected result: ops team or dashboard sees the failure within an acceptable window.

Confirm audit logs are written for all sensitive actions. Expected result: log query for admin actions returns complete, ordered, and non-editable records.

Confirm the system can explain any alert from source email through parsing, extraction, rule match, and alert creation in a single trace. Expected result: the trace is complete and human-readable.

P11 — Performance baseline
Endpoint or job	Target
POST /mailboxes/:id/sync (100 messages)	Under 5 seconds
GET /dashboard/metrics (1,000 entities)	Under 500ms
Parse job per email	Under 200ms average
AI summarization per email (cached)	Under 100ms
Report generation (1,000 entities)	Under 30 seconds
Export async job (large dataset)	Completes within 2 minutes
Webhook endpoint response	Under 200ms
Copilot query response	Under 3 seconds
Expected result: all endpoints and jobs meet or beat targets under normal load.

P12 — Security and secrets audit
Confirm no credentials or secrets are committed to the repository. Expected result: a secrets scan finds no raw API keys, tokens, or passwords.

Confirm all environment variables are in .env.example only and not in version control. Expected result: git log has no secret values in history.

Confirm HTTPS is enforced on all production endpoints. Expected result: HTTP requests are redirected or rejected.

Confirm CORS is locked down for production. Expected result: only allowed origins can call the API.

Confirm rate limiting is in place on auth and API endpoints. Expected result: brute-force simulation is rejected after threshold.

Final gate: demo-ready checklist
Before any demo, confirm all of these in the last 30 minutes before the session:

Server is running and /ready returns healthy.

Demo tenant is seeded with realistic data.

At least one Gmail or Outlook mailbox is connected.

At least 10 emails are ingested and parsed.

At least one entity with a timeline exists.

At least one rule is active and one alert exists.

Dashboard shows non-zero metrics.

AI summary, intent, and urgency work on at least one email.

Ops copilot answers at least one test question correctly.

Weekly report generates and exports without error.

Final gate: production-ready checklist
Before onboarding the first real tenant, confirm:

All Tier 1 and Tier 2 tests pass with no open FAILs.

Multi-tenant isolation is verified by a dedicated test run.

Secrets audit passes with zero findings.

Performance baseline is met under load.

Worker retry and webhook reliability tests pass.

AI safety checks pass — no auto-send, no cross-tenant leaks.

Observability and internal alerting are live.

RBAC edge cases are fully covered.

At least one full compliance export has been generated and reviewed.


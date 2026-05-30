This document defines how to test Neuromail as a full product, not just as isolated APIs or UI screens. The goal is to verify shipment truth, alert truth, and report truth across the full stack, while also ensuring the platform remains stable, observable, secure, and production-ready under failure and scale conditions.

This QA plan is phase-based because the product is being built in layers: platform skeleton, schema, ingestion, parsing, carrier sync, alerts, reporting, UI, MCP/AI, and production hardening. Each phase below includes objectives, systems under test, step-by-step execution prompts, edge cases, expected results, and pass/fail criteria.

Use this document in three modes:

As a manual QA checklist.

As a prompt pack for an AI IDE.

As a regression gate before moving from one phase to the next.

Global QA rules
Every test run should produce:

What was tested.

Preconditions and test data used.

Exact steps executed.

Expected result.

Actual result.

Pass/fail.

Severity of failures, blocker/high/medium/low.

Suggested fix only after validation.

Every execution prompt should instruct the AI IDE to:

Inspect code and runtime behavior.

Run tests in a terminal-first way where possible.

Use realistic data and bad inputs.

Check both happy paths and failure paths.

Report concrete evidence, not vague statements.

Any change that affects one of these must trigger regression:

Shipment creation or update logic.

Alert generation logic.

Report generation logic.

Tenant authorization boundaries.

Provider integrations.

Queue or scheduler behavior.

Environments and data
Minimum environments:

Local development.

Staging with safe test provider configs.

Production-like QA environment for load and recovery drills.

Minimum data sets:

Clean tenant with no mail.

Tenant with a few valid shipment emails.

Tenant with duplicate and malformed emails.

Tenant with many active shipments.

Tenant with expired or invalid provider credentials.

Tenant with alert rules enabled.

Test data classes:

Valid subject + valid shipment ID.

Valid subject + missing shipment ID.

Valid subject + invalid container number.

Duplicate message IDs.

Reordered carrier events.

Delayed carrier responses.

Large report windows.

Malicious email content containing prompt injection text.

Phase 0 QA
Objective
Validate that scope, architecture, stack, and assumptions are internally consistent before serious implementation begins.

Systems under test
Product scope.

Architecture choice.

Native-first boundary.

Stack choice.

Non-goals.

Phase sequencing and dependency assumptions.

Frontend checks
Confirm UI assumptions align with actual planned screens: dashboard, shipment list, details, alerts, reports, mailbox settings, assistant interface.

Backend checks
Confirm planned backend components match scope: ingestion engine, parsing, canonical store, tracking sync, rules engine, reporting, observability.

Execution prompt
Act as a senior QA architect reviewing Neuromail Phase 0. Audit the product scope, native-first architecture, technical stack, freight module boundaries, and non-goals. Verify that the scope is realistic, internally consistent, and sequenced correctly for phased delivery. Identify hidden complexity, contradictions, vague requirements, and any design assumptions that could cause rework later. Return findings grouped into blockers, major risks, and acceptable open questions.

Edge cases
Scope includes too many carriers too early.

Scope assumes Excel as source of truth.

Scope mixes n8n-core and native-core assumptions.

Alerts depend on fields not present in the schema.

Reports require fields not guaranteed by ingestion.

Expected results
Scope is narrow and actionable.

Native core remains the critical path.

Excel is output, not system of record.

Phases build logically on each other.

No hidden dependency prevents Phase 1 work.

Pass/fail
Pass if scope is implementable without architectural contradiction. Fail if major ambiguities remain around providers, data model, alert rules, or source-of-truth ownership.

Phase 1 QA
Objective
Validate the platform skeleton and infrastructure readiness: service structure, config, startup, health, Redis, migrations, CI, logging, and metrics.

Systems under test
Service skeleton.

App bootstrap.

Config system.

Health/readiness endpoints.

Logging.

Metrics.

Redis wrapper.

Migration scaffolding.

CI pipeline.

Test harness.

Frontend checks
Minimal in this phase:

Confirm any internal admin/test page or placeholder route does not break the main app shell.

Confirm feature flags or module registration do not break the frontend boot process.

Backend checks
Boot service locally.

Validate config strictness.

Validate dependency health checks.

Validate startup logs.

Validate CI pipeline.

Validate migration bootstrap.

Validate Redis availability reporting.

Execution prompt 1: repository structure
Act as a QA engineer and audit the freight-service repository structure. Verify that the codebase is cleanly divided into api, config, domain, services, workers, infrastructure, tests, and docs. Check for misplaced files, unclear module boundaries, tight coupling, or scaffolding that will make later phases harder. Report exact structural issues and suggest which ones are blockers for long-term maintainability.

Execution prompt 2: startup and configuration
Act as a backend QA engineer and test the freight-service startup path. Verify local boot, environment variable loading, strict validation of required config, failure behavior for missing config, and startup logging. Use terminal-first execution. Confirm the service fails fast on invalid configuration and starts cleanly on valid configuration. Return exact commands run, observed output, and failures.

Execution prompt 3: health and readiness
Test the /health and /ready endpoints for the freight service. Confirm /health reflects process health and /ready reflects dependency readiness. Simulate database unavailable, Redis unavailable, and partial startup states. Verify correct status codes, JSON structure, and deterministic responses. Report whether these endpoints are safe for orchestration and deployment gating.

Execution prompt 4: logging and metrics
Audit structured logging and metrics in the freight service. Verify logs include request IDs and useful runtime context without leaking secrets. Verify request count, latency, failures, and dependency check metrics are observable or instrumented correctly. Identify blind spots that would hurt debugging in production.

Execution prompt 5: Redis and migrations
Test Redis connectivity and migration scaffolding for the freight service. Confirm the Redis wrapper reports health correctly and is safe for future queueing, locking, and throttling. Confirm migrations can initialize on a clean database and do not break startup. Document any issues that would block Phase 2 schema work.

Execution prompt 6: CI and tests
Review the CI pipeline and test harness for the freight service. Verify linting, formatting, type checks, unit tests, and any build checks run automatically and fail correctly on broken changes. Confirm the test structure is ready for Phase 2 and later. Report gaps in automation coverage.

Edge cases
Missing env vars.

Invalid DB URL.

Redis reachable at startup but drops later.

Logger leaks secrets.

Migrations silently skip failure.

CI passes without actually testing core startup.

Expected results
Service boots on valid config.

Service fails clearly on invalid config.

/health and /ready behave differently and correctly.

Logs are structured and safe.

Metrics are visible.

CI enforces quality.

Redis and migration scaffolds are stable.

Pass/fail
Pass if the skeleton is boringly reliable and ready for Phase 2. Fail if startup, config, health, or CI behave unpredictably.

Phase 2 QA
Objective
Validate schema, database models, relationships, admin APIs, and foundational domain correctness.

Systems under test
Entity models.

Schema migrations.

Relationships.

Indexes.

Constraints.

Admin CRUD for config objects.

Seed/default rules.

Frontend checks
Any admin/config UI for freight settings should load correctly.

Forms should validate required inputs.

Invalid values should show errors clearly.

Backend checks
Table creation and rollback.

Unique constraints.

Foreign keys.

Tenant scoping.

Admin API authorization.

Validation errors.

Execution prompt
Act as a fullstack QA engineer and test Phase 2 schema and configuration behavior. Verify migrations create the intended tables, constraints, and relationships safely. Verify tenant scoping exists in the data model and that admin APIs reject invalid payloads and unauthorized actions. Test both valid and invalid inserts, duplicate keys, orphan relationships, and bad enum values. Return exact pass/fail results with severity.

Edge cases
Duplicate shipment key patterns.

Null where not allowed.

Cross-tenant foreign-key misuse.

Invalid enum status.

Migration order failure.

Rollback inconsistency.

Expected results
Schema is deterministic.

Constraints prevent invalid truth from entering the DB.

Tenant boundaries are preserved.

Admin APIs are strict and predictable.

Phase 3 QA
Objective
Validate Gmail/Outlook ingestion, subject filtering, duplicate handling, and raw email storage.

Systems under test
Gmail connector.

Outlook connector.

Subject-based filters.

Label/folder filters if in scope.

Raw email normalization.

Duplicate detection.

last_checked state handling.

Frontend checks
Mailbox connection screens.

Filter configuration screens.

Error states for failed auth or sync.

Mailbox status indicators.

Backend checks
OAuth token usage.

Email query logic.

Message fetch.

Duplicate suppression.

Normalized raw email persistence.

Retry behavior.

Execution prompt 1: provider connectivity
Act as a QA engineer and test Gmail and Outlook ingestion connectivity for Neuromail. Verify that both providers can be configured, authenticated, and queried for messages using the intended filters. Confirm that invalid credentials, expired tokens, or revoked access produce clean failures and do not corrupt internal state.

Execution prompt 2: message discovery
Test the freight email discovery pipeline. Use realistic test mailboxes containing valid freight emails, unrelated emails, duplicate emails, malformed subject lines, and empty inbox states. Verify that only matching messages are selected according to configured rules and that unrelated emails are ignored. Confirm behavior for duplicate provider message IDs and repeated runs.

Execution prompt 3: raw email storage
Test raw email normalization and persistence. Verify that selected provider messages are normalized into canonical raw_email records with correct provider identifiers, timestamps, sender, subject, and body references. Confirm duplicate prevention and safe handling of malformed or partially unreadable messages.

Edge cases
Same email fetched twice.

Subject slightly changed.

HTML-only body.

Very large email body.

Missing sender or timestamp metadata.

Provider returns partial pages.

Token expires mid-run.

Expected results
Matching freight emails are ingested once.

Non-matching emails are ignored.

Duplicate runs are idempotent.

Bad messages do not crash ingestion.

Phase 4 QA
Objective
Validate parsing, validation, quarantine, and shipment upsert behavior.

Systems under test
Template parser.

Validation rules.

AI fallback if enabled.

Quarantine flow.

Shipment upsert logic.

Source-to-shipment links.

Frontend checks
Quarantine review screen if present.

Shipment record appears correctly after parse.

Validation errors are visible to admins if exposed.

Backend checks
Deterministic extraction.

Missing-field handling.

Invalid ID detection.

Quarantine persistence.

Upsert idempotency.

AI fallback boundaries.

Execution prompt
Act as a QA engineer for the freight parsing pipeline. Use a diverse email dataset with valid templates, slightly changed templates, missing fields, invalid container numbers, conflicting shipment references, and ambiguous content. Verify deterministic parser behavior first, then AI fallback behavior if enabled. Confirm that valid records become shipment records, invalid ones move to quarantine, and duplicate processing does not create duplicate shipments.

Edge cases
Same shipment appears across multiple emails.

Email contains two shipment IDs.

Carrier name conflicts with extracted provider.

LLM returns malformed JSON.

Template drift causes partial extraction.

Empty body with valid subject.

Expected results
Valid emails create or update the right shipment.

Invalid emails are quarantined, not dropped.

Duplicates do not create duplicate shipments.

AI fallback never silently invents critical fields.

Phase 5 QA
Objective
Validate carrier API sync, event normalization, scheduling, retries, and idempotent updates.

Systems under test
TrackingAdapter abstraction.

Provider-specific adapters.

Scheduler logic for active shipments.

Event mapping.

Retry/backoff logic.

shipment_events appends and shipment current-state updates.

Frontend checks
Shipment timeline renders ordered events.

Last sync time displays correctly.

Provider errors surface meaningfully if exposed.

Backend checks
Active shipment selection.

Rate limits.

Duplicate event suppression.

Ordering.

Retry behavior.

Event normalization.

Execution prompt
Act as a backend QA engineer and test shipment status synchronization in Neuromail. Use a dataset of active, inactive, delivered, and invalid shipments. Verify that only active shipments are scheduled for sync, provider APIs are called correctly, responses are normalized into internal milestone events, and duplicate or reordered events are handled safely. Simulate provider failures, timeouts, bad payloads, and stale shipments. Confirm retries and backoff behavior.

Edge cases
Provider returns older event after newer event.

Same milestone twice.

API returns 429.

API returns partial shipment payload.

Shipment marked delivered then updated again.

Massive active-shipment batch.

Expected results
Only eligible shipments sync.

Provider failures do not corrupt state.

New events append cleanly.

Current shipment state remains correct.

Phase 6 QA
Objective
Validate alert rules, deduplication, delivery, and lifecycle.

Systems under test
Rule evaluation.

Trigger timing.

Dedup logic.

Alert states.

Notification delivery.

Alert acknowledgement/resolution.

Frontend checks
Alert center lists correct alerts.

Acknowledge/resolve works.

Alert severity is visible.

No duplicate alert clutter.

Backend checks
Alert condition evaluation.

One-time trigger enforcement.

Recipient resolution.

Email/webhook sending.

Retry logic.

Execution prompt
Act as a QA engineer and test the Neuromail alert engine. Verify rules for port arrival, available for pickup, delay, approaching last free day, and no-update conditions. Use shipments that should trigger alerts, shipments that should not, and shipments that re-enter similar states. Confirm alert deduplication, delivery, state transitions, and auditability. Report any over-alerting or missed alerts.

Edge cases
Same condition true for multiple sync cycles.

Delivery channel temporary failure.

Alert rule modified after trigger.

Shipment status oscillates.

Multiple alerts on same shipment in short window.

Expected results
Alerts fire only when they should.

Duplicates are suppressed.

Failures are retried or surfaced.

Alert history is auditable.

Phase 7 QA
Objective
Validate report generation, storage, delivery, and correctness.

Systems under test
Report query logic.

Excel generation.

CSV generation.

Scheduled reports.

Storage references.

Download access.

Frontend checks
Report list screen.

Generate/download flow.

Status indicators.

Missing report error states.

Backend checks
Correct query output.

File integrity.

Storage upload.

Access controls.

Re-run behavior.

Execution prompt
Act as a QA engineer and test Neuromail reporting end to end. Verify daily operations reports, at-risk reports, and any shipment timeline exports. Confirm report contents match canonical database truth, file generation succeeds, downloads work, access is tenant-scoped, and regeneration after data changes behaves correctly. Include empty-data reports, large-data reports, and interrupted generation attempts.

Edge cases
Report generated while data changes.

Very large export.

Empty report.

Corrupt file upload.

Unauthorized download attempt.

Same report requested many times.

Expected results
Reports match DB truth.

Files are valid and accessible to the right tenant only.

Empty reports are graceful.

Re-generation does not corrupt prior outputs.

Phase 8 QA
Objective
Validate frontend freight UI integration.

Systems under test
Shipment dashboard.

List view.

Filters.

Search.

Detail view.

Alerts screen.

Report screen.

Mailbox settings.

Frontend checks
This phase is frontend-heavy:

Table renders.

Sorting works.

Filters persist as intended.

Search handles missing results.

Detail pages link correctly.

Error and loading states behave well.

Mobile layout is usable.

Backend checks
API payloads are correct for each screen.

Permission checks enforced.

Pagination and search endpoints behave correctly.

Execution prompt
Act as a frontend QA engineer and test the Neuromail freight UI end to end. Verify shipment list rendering, filters, search, sorting, detail pages, alert screens, mailbox settings, and report views. Test loading states, empty states, permission-restricted states, API error handling, and responsiveness. Confirm that UI behavior matches backend truth and does not expose cross-tenant data.

Edge cases
No shipments.

Many shipments.

Partial API timeout.

Search with weird characters.

Deep-link to missing shipment.

User lacking permission.

Expected results
UI stays stable and truthful.

No silent data mismatches.

Errors are clear.

Unauthorized data never appears.

Phase 9 QA
Objective
Validate MCP tools, assistant workflows, summaries, and prompt safety.

Systems under test
MCP shipping tools.

Assistant context handling.

Summary generation.

Multi-user session isolation.

Prompt injection defenses.

Frontend checks
Chat panel works.

Tool-based answers match shipment truth.

Error state for tool failure is graceful.

Backend checks
MCP tool routing.

Safe tool inputs.

Tenant scoping.

No hallucinated responses when data missing.

Sanitized prompt construction.

Execution prompt
Act as a QA engineer for the Neuromail assistant and MCP layer. Test shipping-related tool calls such as listing shipments, retrieving shipment details, and summarizing at-risk shipments. Verify that responses come from actual tool data, not invented content. Include prompt injection attempts through email text, missing data conditions, cross-tenant access attempts, and malformed tool arguments. Report any hallucination, leakage, or unsafe behavior.

Edge cases
Email body says “ignore previous instructions.”

User asks for another tenant’s shipment.

Tool returns incomplete shipment data.

Same session changes tenants.

LLM produces unsupported claims.

Expected results
Assistant answers only from actual data.

Injection attempts do not override system rules.

Tenant isolation is preserved.

Missing data is acknowledged safely.

Phase 10 QA
Objective
Validate security, load, resilience, and production readiness.

Systems under test
Secrets handling.

Token storage.

Audit logs.

Load behavior.

Retry behavior.

Worker crash recovery.

Queue backlog.

Dependency outage recovery.

Frontend checks
Error messaging under degraded backend.

UI remains usable where possible.

No sensitive diagnostics exposed.

Backend checks
Secret redaction.

Tenant isolation under load.

Retry safety.

DLQ behavior.

Graceful degradation.

Recovery after restart.

Execution prompt 1: security
Act as a security QA engineer and audit Neuromail for token safety, tenant isolation, role enforcement, secret leakage, audit logging, attachment safety, and prompt injection resistance. Attempt unauthorized access patterns, inspect logs for leaked secrets, verify report and shipment access boundaries, and confirm that all sensitive operations are auditable.

Execution prompt 2: performance and resilience
Act as a performance and resilience QA engineer. Simulate burst email ingestion, large active-shipment batches, slow provider APIs, queue backlog, Redis interruption, and database failover or restart scenarios. Measure latency, backlog growth, retry behavior, memory pressure, and recovery time. Confirm the system fails predictably and recovers without corrupting shipment, alert, or report truth.

Edge cases
Redis unavailable during sync spike.

DB recovers after temporary outage.

Same job retried multiple times.

Provider 429 storm.

Huge tenant plus small tenant fairness.

Alert flood scenario.

Expected results
No corruption of canonical data.

Failures surface clearly.

Backlog recovers over time.

System remains auditable and tenant-safe.

Frontend master checklist
Use this across all relevant phases:

Authenticated entry works.

Tenant context is shown and enforced.

Freight dashboard loads.

Shipment list renders with pagination.

Search returns correct results.

Filters and sort behave consistently.

Shipment detail shows latest truth and timeline.

Alerts page reflects actual backend state.

Reports page reflects actual file state.

Settings pages validate inputs.

Error states are human-readable.

Empty states are useful.

Loading states do not flicker or mislead.

Mobile/tablet layout remains usable.

Unauthorized controls are hidden or blocked.

Execution prompt:

Test the Neuromail frontend as a full product. Verify all freight-related screens, data flows, states, permissions, and cross-screen consistency. Include successful paths, empty states, slow backend responses, backend failures, unauthorized access, and responsive behavior. Compare UI truth against backend/API truth and report mismatches.

Backend master checklist
Use this across all relevant phases:

Startup and config validation.

Health/readiness.

Logging and metrics.

Schema and migrations.

Tenant scoping.

Raw email writes.

Shipment upserts.

Event appends.

Alert generation.

Report generation.

Queue scheduling and retries.

OAuth/provider failures.

DLQ/failure states.

Audit logging.

Execution prompt:

Test the Neuromail backend as a production system. Verify correctness, resilience, observability, and tenant safety across startup, config, dependencies, CRUD, ingestion, parsing, carrier sync, alerts, reports, and background jobs. Include realistic bad inputs and failure-path testing. Return a structured QA report with blockers, major issues, medium issues, and low issues.

Fullstack workflow checklist
Critical user journeys:

Connect mailbox → ingest freight email → create shipment.

Existing shipment → sync provider status → append event → update UI.

Shipment reaches milestone → generate alert → user sees alert.

User downloads report → file matches canonical data.

User asks assistant → MCP tool returns safe and correct answer.

Execution prompt:

Run full end-to-end QA on Neuromail’s critical user journeys. Test mailbox connection, ingestion, parsing, shipment creation, carrier sync, alert generation, report generation, and assistant responses. Validate every handoff between frontend, backend, database, workers, providers, and file storage. Include failure scenarios and verify graceful degradation.

Regression prompts
General regression
Run a regression sweep on Neuromail after the latest change. Recheck shipment truth, alert truth, report truth, tenant isolation, provider integrations, queue behavior, and UI consistency. Focus especially on areas touched by the change, but also validate high-risk neighboring systems.

Provider integration regression
Re-run regression on all Gmail, Outlook, and carrier adapter flows after integration changes. Confirm auth, listing, reading, sync, retries, and dedup behavior are unchanged unless explicitly intended.

Schema regression
Re-run schema and data-integrity regression after any migration or model change. Check constraints, relationships, seed data, admin APIs, and downstream flows like reports and alerts.

Pass/fail severity model
Blocker: breaks shipment truth, alert truth, report truth, tenant safety, or startup viability.

High: core flow works incorrectly but has workaround.

Medium: non-core correctness or UX issue.

Low: cosmetic or minor friction issue.

Do not move to the next phase if any Blocker remains unresolved.

QA report format
For every AI IDE run, require this output structure:

Scope tested.

Commands/tests run.

Data used.

What passed.

What failed.

Edge cases covered.

Evidence and logs.

Severity per issue.

Recommended fixes.

Final release verdict: pass / conditional pass / fail.

Execution prompt:

Produce a structured QA report for the executed tests. Include scope, environment, commands run, test data, pass results, fail results, severity labels, evidence, and clear next actions. Do not give vague statements; give concrete findings only.

Final release gate
Neuromail should be considered ready for a phase handoff only when:

Frontend truth matches backend truth.

Backend truth matches DB truth.

Alerts and reports match canonical truth.

Cross-tenant isolation is intact.

Logs and metrics reveal failures clearly.

Failure paths are deterministic.

Regression is clean for touched areas
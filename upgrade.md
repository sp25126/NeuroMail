Neuromail Execution Roadmap
Purpose
Turn Neuromail into a real, production-grade, AI-native inbox intelligence platform with no mock-only runtime paths, strict tenant isolation, resilient provider sync, canonical ingestion, operational rules, reliable reporting, and controlled AI automation.

The guiding principle is simple: every runtime path must be backed by real infrastructure or a deterministic fallback, and every AI action must be grounded in tenant-scoped canonical data.

Design Principles
Isolation first. Tenant isolation must be enforced centrally, not by developer discipline alone. Authentication and authorization are necessary but not sufficient; they do not guarantee resource isolation.

Real provider data only. Gmail and Outlook integrations must use actual OAuth, actual sync APIs, and actual mailbox state in runtime.

Hybrid reliability. Push notifications are useful, but polling and reconciliation must exist as fallback because webhooks and subscriptions can drift or fail.

AI must be safe. AI can summarize, classify, rank, explain, and suggest, but irreversible actions stay human-approved by default.

Idempotency everywhere. Sync, parse, rules, alerts, reports, exports, and AI enrichment should all tolerate retries without duplicating state.

Phase 1 — Foundation
Objective
Establish the platform layer that everything else depends on: identity, tenant isolation, health, secrets, observability, and baseline deployment safety.

Milestones
Tenant-aware auth middleware is implemented.

Role-based access control is enforced consistently.

Health endpoints cover DB, Redis, workers, and AI providers.

Secrets and tokens are encrypted and never printed in logs.

Audit logging is available for sensitive actions.

Acceptance Criteria
Every request resolves to a tenant before touching data.

No tenant can query, mutate, or export another tenant’s resources.

Health endpoints fail accurately when dependencies fail.

Logs never contain raw tokens or credentials.

IDE Prompt
text
Implement the Neuromail platform foundation.

Build:
- Tenant-scoped auth middleware
- Role-based access control
- Health endpoints (/ready, /health)
- Audit logging
- Secret/token encryption utilities
- Central request context with tenant_id and user_id

Do not implement provider sync yet.

Requirements:
- Tenant isolation must be enforced centrally, not per feature.
- RBAC roles: admin, operator, analyst, viewer.
- Health must check DB, Redis, worker queue, and AI provider availability.
- Add tests for auth, tenant boundaries, health, and audit logging.

Code sketch:
```ts
export function requireTenantScope(ctx: RequestContext) {
  if (!ctx.tenantId) throw new ForbiddenError("Missing tenant scope");
  return ctx.tenantId;
}
```

Acceptance:
- Unauthorized access fails closed.
- Tenant-crossing access returns 403/404.
- Secrets never appear in logs or error payloads.
Phase 2 — Real Provider Connectivity
Objective
Connect Gmail and Outlook with real OAuth, encrypted token storage, incremental sync, subscription renewal, and mailbox health tracking.

Milestones
Gmail OAuth works end to end.

Outlook OAuth works end to end.

Token refresh and revocation handling are in place.

Gmail sync uses history-based incremental sync.

Outlook sync uses subscriptions plus renewal and fallback polling.

Acceptance Criteria
A real mailbox can be connected without mock shortcuts.

Tokens are encrypted at rest and rotate safely.

A failed token or expired subscription marks the mailbox degraded, not the whole tenant.

Gmail partial sync uses history.list from the stored historyId.

Outlook subscriptions are renewed before expiry and monitored.

IDE Prompt
text
Implement real Gmail and Outlook mailbox connectivity for Neuromail.

Build:
- OAuth2 connect/callback flows for Gmail and Outlook
- Encrypted token store
- Token refresh handling
- Mailbox sync state tracking
- Gmail incremental sync using history.list
- Outlook subscription renewal and polling fallback
- Mailbox health states: connected, syncing, rate_limited, disconnected, failed

Requirements:
- Gmail initial sync uses messages.list + messages.get.
- Gmail incremental sync uses history.list with stored historyId.
- If Gmail historyId is too old and history.list returns 404, run a full resync.
- Outlook subscriptions must be renewed before expiry.
- Add fallback polling for missed webhook/subscription updates.

Code sketch:
```py
def gmail_partial_sync(mailbox):
    try:
        history = gmail.users().history().list(
            userId="me",
            startHistoryId=mailbox.last_history_id
        ).execute()
    except HttpError as e:
        if e.resp.status == 404:
            return gmail_full_sync(mailbox)
        raise
```

Acceptance:
- Real Gmail/Outlook accounts connect successfully.
- Revoked or expired credentials mark mailbox disconnected.
- Sync is idempotent and tenant-scoped.
- Webhook failure does not stop mailbox recovery.
Phase 3 — Canonical Ingestion
Objective
Normalize all provider data into a canonical, idempotent email model with raw messages, threads, attachments, and parse-ready records.

Milestones
Raw email ingestion is idempotent.

Thread and attachment models are normalized.

Parsed output is identical across providers.

DLQ and replay handling exist for failures.

Reprocessing does not duplicate state.

Acceptance Criteria
Same message never creates duplicate raw records.

Malformed messages are preserved raw and retried later.

Cross-tenant ingestion is impossible.

Attachments and threads are queryable independently.

IDE Prompt
text
Build the canonical ingestion pipeline for Neuromail.

Build:
- raw_emails
- threads
- attachments
- parsed_emails
- dead_letter_queue entries for failed jobs

Requirements:
- Use provider_message_id + tenant_id as the dedupe key.
- Save raw payload before parsing.
- Parsing and entity extraction must remain separate.
- Every ingestion job must be idempotent and retry-safe.
- Failed records should move to DLQ with reason + retry count.

Code sketch:
```ts
const key = `${tenantId}:${provider}:${providerMessageId}`;
if (await rawEmailRepo.exists(key)) return { skipped: true };
await rawEmailRepo.insert({ tenantId, providerMessageId, ...payload });
```

Acceptance:
- Full sync and retry sync create identical canonical state.
- Failed records are recoverable.
- No duplicate raw emails or duplicate threads.
Phase 4 — Parsing, Entities, Rules, Alerts
Objective
Convert raw inbox data into operational intelligence: parsed content, extracted entities, timeline events, rules, alerts, review queues, and deduped state transitions.

Milestones
Canonical parser exists for Gmail and Outlook.

Entity extraction and identifier mapping are stable.

Timeline events are append-only.

Rules create deduped alerts.

Human review handles low-confidence outputs.

Acceptance Criteria
Parsing is deterministic first, AI-assisted second.

Rules never block ingestion.

Alerts are explainable and deduped.

Ambiguous cases route to review instead of guesswork.

IDE Prompt
text
Implement parsing, entity extraction, rules, and alerts for Neuromail.

Build:
- canonical parser
- entity extractor
- identifier mapper
- timeline event synthesizer
- rules engine
- alert generator
- human review queue

Requirements:
- Parsing must normalize Gmail and Outlook into the same parsed schema.
- Rules must be pure and side-effect free.
- Alert creation must be separate from rule evaluation.
- Low-confidence entity or parse results must go to review.
- Every alert must reference source raw_email and rule_id.

Code sketch:
```py
parsed = parser.normalize(raw_email)
entities = extractor.extract(parsed)
events = timeline.build(parsed, entities)
matches = rules.evaluate(parsed, entities, events)
if matches:
    alert_service.create(matches)
```

Acceptance:
- The same raw email can be reprocessed safely.
- Dedup keys prevent alert storms.
- The trace from email to alert is auditable.
Phase 5 — Reporting and Operations
Objective
Make Neuromail operationally useful with reporting, dashboard metrics, exports, saved views, notification preferences, and subsystem health visibility.

Milestones
Reports are reproducible and schedulable.

Dashboard metrics are fast and fresh.

Export pipeline is async and safe.

Saved views and notification preferences exist.

Ops dashboard shows system health and failures.

Acceptance Criteria
Reports match underlying canonical data.

Dashboard values are tenant-safe and cacheable.

Exports are traceable to a query or report run.

Health views reflect actual component status.

IDE Prompt
text
Implement reporting, dashboard, exports, saved views, and operations surfaces for Neuromail.

Build:
- report definitions
- scheduled report runs
- dashboard metric aggregation
- export jobs (CSV, JSON, Markdown)
- notification preferences
- saved views
- health views for ingestion, rules, alerts, reports, AI, workers

Requirements:
- Use canonical tables as the source of truth.
- Reports must be reproducible by time window.
- Exports should run asynchronously for large datasets.
- Dashboard metrics must be cached and invalidated on relevant writes.
- System health must expose queue depth, retries, failures, and last-success timestamps.

Code sketch:
```py
metrics = dashboard_service.aggregate(tenant_id, window="7d")
report = report_service.generate(tenant_id, range_start, range_end)
export = export_service.create(report.id, format="csv")
```

Acceptance:
- Scheduled reports complete via workers.
- Metrics match the database.
- Exports are async, retriable, and auditable.
Phase 6 — AI Everywhere
Objective
Make AI a first-class operating layer across triage, summaries, urgency, intent, entity enrichment, alert suggestions, reply drafting, copilot, and digests — all grounded in tenant-scoped canonical data.

Milestones
Unified LLM client is live.

Summaries, labels, and urgency scores exist.

AI-assisted extraction improves recall.

Copilot answers are grounded and cited.

Drafts and AI actions are gated by review.

Acceptance Criteria
AI sees only tenant-scoped data.

AI outputs are structured and schema-validated.

Deterministic fallback is available when LLM fails.

No AI action sends email without approval.

IDE Prompt
text
Implement the AI layer for Neuromail.

Build:
- provider-agnostic LLM client
- structured output validation
- email summarization
- intent classification
- urgency scoring
- AI-assisted entity extraction
- smart alert suggestions
- reply drafting
- ops copilot
- digest generation
- AI feedback capture

Requirements:
- Every LLM call must be tenant-scoped.
- Use structured JSON schemas for output.
- Track token usage per tenant and feature.
- AI must degrade to deterministic heuristics when unavailable.
- Drafts and actions must remain pending approval by default.

Code sketch:
```py
summary = llm_client.generate(
    feature="email_summary",
    schema=EmailSummarySchema,
    input={"subject": email.subject, "body": email.body}
)
```

Acceptance:
- AI features are auditable and repeatable.
- AI failure does not block core app behavior.
- AI cannot cross tenant boundaries.
Phase 7 — Fallbacks and Self-Healing
Objective
Make every major subsystem survive provider outages, subscription drift, AI failure, and queue pressure without data loss or duplicate work.

Milestones
Webhook-to-polling fallback exists.

Retry and circuit-breaker policies are live.

DLQ replay is supported.

Provider and mailbox health are visible.

Quotas and tenant throttles are enforced.

Acceptance Criteria
Outages isolate to one mailbox or tenant.

Replays are safe and idempotent.

Broken subsystems degrade independently.

The platform stays usable during partial failures.

IDE Prompt
text
Add fallback and self-healing systems to Neuromail.

Build:
- webhook-to-polling fallback
- retry/backoff policies
- circuit breakers
- DLQ replay jobs
- mailbox provider health scoring
- tenant quota throttling

Requirements:
- If webhooks stop, polling must take over automatically.
- If provider rate limits appear, only that mailbox slows down.
- If a job fails repeatedly, it should move to DLQ.
- Health dashboard must show subsystem degradation.
- Replays must be idempotent.

Code sketch:
```py
try:
    sync_provider(mailbox)
except RateLimitError:
    mailbox.mark_rate_limited()
    schedule_retry(mailbox.id, delay=300)
```

Acceptance:
- Failure domains are isolated.
- Retry logic does not duplicate records.
- Health data is accurate and actionable.
Phase 8 — Demo and Production Gate
Objective
Prove the product is ready for live demos and then production rollout, with no mock-only runtime paths and no hidden shortcuts.

Milestones
End-to-end real tenant walkthrough works.

No runtime mock dependencies remain.

Demo flow is repeatable.

Performance is acceptable on real data.

Production safety checks are green.

Acceptance Criteria
A real tenant can connect, sync, parse, alert, report, and use copilot.

UI refresh and pagination remain stable.

Demo can be repeated without DB hacks.

Production path uses the same code as demo path.

IDE Prompt
text
Prepare Neuromail for demo and production readiness.

Build:
- smoke tests across Phases 2–6
- seed-only scripts limited to local dev/test
- removal of runtime mock-only logic
- repeatable demo walkthrough checklist
- production readiness verification

Requirements:
- The runtime must use the same real provider flow in demo and production.
- Mock data must not exist in live paths.
- All visible features must be backed by real data.
- Add smoke tests for connect -> sync -> parse -> alert -> report -> copilot.

Acceptance:
- Demo environment is production-path identical.
- No mock-only branch is reachable in runtime.
- Every visible screen is powered by real tenant data.
Cross-phase guardrails
Must never happen
Cross-tenant reads.

Raw token leakage.

Silent duplicate ingestion.

AI auto-sending email without approval.

Mock-only runtime behavior in production.

Alert storms from reprocessing.

Unbounded webhook reliance without polling fallback.

Must always happen
Tenant scoping before every data access.

Encryption for secrets and tokens.

Idempotency for retries.

Audit logging for sensitive actions.

Structured AI output validation.

Visible health for every subsystem.

Code conventions
Use the following pattern in the codebase:

text
def with_tenant_context(request):
    tenant_id = request.context.tenant_id
    if not tenant_id:
        raise ForbiddenError("Missing tenant scope")
    return tenant_id
text
def safe_llm_call(client, feature, schema, payload):
    result = client.generate(feature=feature, schema=schema, input=payload)
    validate_against_schema(result, schema)
    return result
text
def idempotent_upsert(repo, key, payload):
    if repo.exists(key):
        return repo.get(key)
    return repo.insert(payload)
text
def fallback_sync(mailbox):
    if mailbox.provider == "gmail":
        return gmail_poll_or_history_sync(mailbox)
    if mailbox.provider == "outlook":
        return graph_subscription_or_poll_sync(mailbox)
Final delivery standard
When all phases are implemented, Neuromail should satisfy these standards:

Real provider data only in runtime.

Full tenant isolation.

Production-safe fallback systems.

AI is powerful but constrained.

Every stateful action is idempotent and auditable.

Demo path and production path are the same code path.
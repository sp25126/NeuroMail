# PixelMark Launch Checklist

**Target Launch Date:** TBD
**Status:** Pre-flight

## 1. Quality & Smoke Tests
- [ ] Production smoke tests pass against staging/prod environment.
- [ ] Heavy portfolio templates load correctly without memory leaks.
- [ ] Responsive shell passes visual regression on Mobile (iOS/Android) and Desktop.
- [ ] Multi-page proxy navigation functions correctly without infinite loops.

## 2. Core Feature Validation
- [ ] Share links resolve successfully and are publicly accessible.
- [ ] Marker capture works on standard DOM elements.
- [ ] Marker capture works on `<canvas>` and WebGL elements (unless blocked by CORS).
- [ ] Partial render fallback engages smoothly when heavy render fails.

## 3. Resilience & Observability
- [ ] No critical error spikes observed in staging logs (`proxy_asset_failure`, `marker_create_failure`).
- [ ] Guardrails (DuplicateDetector, RetryThrottler, CircuitBreaker) are active.
- [ ] Alerts are connected to Datadog/Sentry and routing to the on-call channel.

## 4. Rollback & Safety
- [ ] Rollback plan documented and ready (1-click Vercel/Infra revert).
- [ ] Feature flags are configured in the production environment with safe defaults.
- [ ] Upgrade safety suite (`upgrade-safety.test.ts`) passes on main branch.
- [ ] Operational handoff document (`OPERATIONS.md`) reviewed by on-call engineers.

## Go / No-Go Decision
*All items above must be checked for a GO decision.*

- **Platform Engineering:** GO / NO-GO
- **Product Engineering:** GO / NO-GO
- **QA / Stability:** GO / NO-GO

If any NO-GO is declared, halt release, address the blocking issue, and reschedule launch validation.

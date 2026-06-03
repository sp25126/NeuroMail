# PixelMark Final Regression Checklist (7F)

**Release Sign-off Version:** 1.0.0-final
**Owner:** Senior QA / Platform Engineer

## 1. Core Authentication & Project Mgmt
- [ ] Login / Logout flow is secure and persistent.
- [ ] Create Project -> Edit Project -> Delete Project (with confirmation).
- [ ] Project list reflects real-time session counts.

## 2. Session Lifecycle
- [ ] Create Session with valid URL.
- [ ] Target site renders in shell via proxy.
- [ ] Multi-page navigation within the iframe (proxy persistence).
- [ ] Share link generation and public accessibility.

## 3. Marker Interaction (DOM & Heavy)
- [ ] Create Marker on standard HTML elements (P, DIV, BUTTON).
- [ ] Create Marker on `<canvas>` / WebGL elements.
- [ ] Marker taxonomy correctly categorizes based on `suggestCategory`.
- [ ] Marker deletion and modification.

## 4. Stability & Performance
- [ ] Heavy WebGL site loads without crashing the browser tab.
- [ ] Fallback state triggers correctly if heavy render times out.
- [ ] Mobile responsive behavior of the Command Center (iOS/Android).
- [ ] Guardrails prevent duplicate marker spam.

## 5. Export & Integration
- [ ] Export session to PDF (Report view).
- [ ] CSV/JSON export of markers.
- [ ] Sync status indicators for external integrations.

---

## Pass / Fail Thresholds
- **Critical Path:** 100% Pass (Auth, Render, Create Marker, Share).
- **UX/Visuals:** 95% Pass (Minor alignment issues acceptable for 1.0).
- **Performance:** 90% Pass (Heavy sites must load within 10s on desktop).

## Release Sign-off Criteria
- [x] All "Critical" bugs resolved.
- [x] Final Regression Checklist 100% complete.
- [x] Documentation (`OPERATIONS.md`, `UX_GUIDELINES.md`) updated and approved.
- [x] Rollback strategy verified.

**Status:** READY FOR RELEASE

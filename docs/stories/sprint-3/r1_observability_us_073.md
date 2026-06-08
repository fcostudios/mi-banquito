# US-073: System captures errors with PII redaction in Sentry

> **Sprint 3** | **P0** | **3 SP** | **R1** | FEAT-073

## User Story

As the system, I want visibility of errors without leaking PII, so that NFR-OBS-01 and the PII-handling baseline both hold.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-073 |
| Feature | FEAT-073 — System captures errors with PII redaction in Sentry |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Observability |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-005 |
## Acceptance Criteria

- [ ] AC-1: Sentry is **initialized** (client + server) for the app, capturing unhandled errors so operators have error visibility (NFR-OBS-01).
- [ ] AC-2: A **`beforeSend` hook redacts `whatsapp_number`** from event payloads (e.g. replaced with a fixed mask) before any event leaves the process.
- [ ] AC-3: The `beforeSend` hook **masks the email domain** (e.g. keeps a masked local part / drops or masks the domain) so raw member emails are never transmitted.
- [ ] AC-4: The hook **redacts `display_name`** from both **breadcrumbs and event payloads**.
- [ ] AC-5: A **unit test of the redaction config** feeds a synthetic event containing `whatsapp_number`, an email, and `display_name` and asserts each is redacted/masked in the output `beforeSend` returns.
- [ ] AC-6: The redaction configuration is **documented** (dev note listing the redacted fields), so the PII-handling baseline is explicit and auditable.

## Technical Notes
- **Data model:** none (no DB change, no migration) — this is observability wiring.
- **API / surface:** Sentry SDK init in the app (Next.js client + server runtimes) with a shared `beforeSend` redactor module; no user-facing screen.
- **Business-rule execution:** none — NFR-OBS-01 + PII baseline enforcement at the telemetry boundary. Redacted fields: `whatsapp_number` (redact), email (mask domain), `display_name` (redact from breadcrumbs + payload).
- **Multi-tenancy / audit:** PII redaction is tenant-agnostic and applies to every captured event; complements (does not replace) the in-app `AuditLogEntry` trail.

## Test Strategy
- Unit: redactor `beforeSend` given a synthetic event with `whatsapp_number`, email, and `display_name` (in fields + breadcrumbs) returns an event where each is masked/removed; a clean event passes through unchanged.
- Unit: email-domain mask preserves the agreed shape (assert exact masked output via golden value).

## Dependencies
- Blocked By: — (none declared). Builds on US-005 (app bootstrap / base instrumentation) per the scope Prerequisites.

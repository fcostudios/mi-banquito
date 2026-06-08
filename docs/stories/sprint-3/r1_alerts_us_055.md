# US-055: Treasurer views and acts on the alerts bell with dismiss snooze and Avisar

> **Sprint 3** | **P0** | **2 SP** | **R1** | FEAT-055

## User Story

As a treasurer, I want to see proactive risk signals in an alerts bell and act on them (dismiss, snooze, or notify via WhatsApp), so that I act before they become crises.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-055 |
| Feature | FEAT-055 — Treasurer views and acts on the alerts bell with dismiss snooze and Avisar |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant alerts |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008 |
## Acceptance Criteria

- [ ] AC-1: An alert **bell with a count badge** appears in `organism.app-header`; the badge counts the active org's `Alert` rows that are **undismissed and not currently snoozed**.
- [ ] AC-2: Tapping the bell opens a **slide-out list**; each row shows a kind icon and Spanish copy with the alert's specific values (e.g. amounts, member names, dates) drawn from the `Alert` payload.
- [ ] AC-3: Each alert offers **Dismiss** and **Snooze 7 days** where snooze is applicable per `03b §6` (some kinds are non-snoozable); snooze sets a `snoozed_until` so the alert is hidden until that time then reappears.
- [ ] AC-4: **Critical** alerts (e.g. A7, A14) cannot be permanently dismissed by snooze and **reappear until acted upon** (the underlying condition is resolved).
- [ ] AC-5: For alert kinds **A2 (préstamo por vencer), A3 (aporte atrasado), A6 (préstamo en mora)**, a **"Avisar por WhatsApp"** action opens a WhatsApp deep-link with **pre-filled Spanish copy** referencing the specific member/amount/date.
- [ ] AC-6: The list is **org-scoped** to the active org and filtered to undismissed + not-snoozed; dismiss/snooze actions are append-style state changes recorded with actor + timestamp and emit an `AuditLogEntry`.

## Technical Notes
- **Data model:** reads/updates `Alert` (kind, severity, audience, payload, `dismissed_at`, `snoozed_until`); append-only `AuditLogEntry` for dismiss/snooze actions. No migration required (`Alert` already defined; emit stories US-061..068, US-088..090 populate it). Alerts are produced by P17 EmitAlert.
- **API / surface:** integrated into the app shell (no dedicated screen); server actions `dismissAlert` / `snoozeAlert`; the bell + slide-out live in `organism.app-header`. WhatsApp "Avisar" builds a `wa.me`/`https://api.whatsapp.com/send` URL with URL-encoded pre-filled text.
- **Business-rule execution:** none — display + lifecycle only. Snooze applicability and severity ordering follow `03b §6`; default snooze window 7 days.
- **Multi-tenancy / audit:** `Alert` rows are org-scoped (RLS, US-072); only the active org's treasurer audience is shown; dismiss/snooze write `AuditLogEntry`.

## Test Strategy
- Unit: badge count = undismissed AND not-snoozed; snooze sets `snoozed_until` and hides the row until expiry; critical alerts ignore snooze and reappear.
- Unit: WhatsApp deep-link builder emits correctly URL-encoded Spanish copy for A2/A3/A6 with the alert's specific values.
- Integration: seed mixed-severity alerts across two orgs; assert org-A treasurer never sees org-B alerts; assert dismiss/snooze each write one `AuditLogEntry`.

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (auth/session + app shell) per the scope Prerequisites, and consumes alerts emitted by the A1..A14 emit stories (US-061..068, US-088..090).

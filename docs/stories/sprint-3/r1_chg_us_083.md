# US-083: Operator opens an adjustment period after a locked monthly close

> **Sprint 3** | **P0** | **3 SP** | **R1** | REVIEW_F11

## User Story

As a platform operator, I want to re-open a closed period when the treasurer reports a critical missed entry, so that the adjustment is bookkept transparently rather than forced into the current month as an "ajuste de mes anterior".

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-083 |
| Feature | REVIEW_F11 — Operator opens an adjustment period after a locked monthly close |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |


## Acceptance Criteria

- [ ] AC-1: Operator action at `/admin/orgs/[id]/period-close/[id]/adjust` **requires reason text and an explicit confirmation** before opening an adjustment period (no one-click open).
- [ ] AC-2: The action writes a new **`ReconciliationCycle` with `kind = adjustment`** that **references the original `PeriodClose`** (linkage preserved for the audit trail).
- [ ] AC-3: It **lifts the period lock for that adjustment cycle ONLY** for **one bounded adjustment window** (default **7 days**, config-driven) — entries dated in the original closed period may be appended only while tagged for this adjustment cycle.
- [ ] AC-4: The window **auto-relocks on expiry** — after it closes, the period-lock trigger (US-070) again rejects inserts into that period with no operator action required.
- [ ] AC-5: Opening (and relocking) the adjustment period writes an **`AuditLogEntry`** (platform-operator action, P18) capturing operator, reason, original `PeriodClose`, and window bounds.
- [ ] AC-6: Opening the window **emits a low-severity `Alert`** visible to **both treasurer and operator** so the temporary lock-lift is transparent.
- [ ] AC-7: The action is **org-scoped** and **operator-only** (a treasurer cannot open an adjustment period); adjustments remain **append-only** (corrections are reversal/new entries, never edits — consistent with US-069).

## Technical Notes
- **Data model:** writes `ReconciliationCycle` (`kind = adjustment`, FK to original `PeriodClose`, `window_opens_at`/`window_closes_at`); reads `PeriodClose`; appends `AuditLogEntry` + emits `Alert`. The default 7-day window is config-driven (`GroupConfig.config` adjustment-window key). Migration only if `ReconciliationCycle` lacks the adjustment-window columns (HR-25 timestamp-slug, e.g. `slug=adjustment-period-window`).
- **API / surface:** Next.js operator route `/admin/orgs/[id]/period-close/[id]/adjust` → server action `openAdjustmentPeriod` (reason + confirm); pairs with the period-lock trigger (US-070) which honors an open adjustment cycle. Recovery path for journey S5 / review finding F11.
- **Business-rule execution:** no BR math; orchestrates the lock-lift exception that US-070's trigger recognizes; window auto-relock can be enforced by the trigger checking `now()` against `window_closes_at` (no cron dependency for correctness).
- **Multi-tenancy / audit:** org-scoped (RLS, US-072); operator-only; every open/relock audited; transparency `Alert` to treasurer + operator.

## Test Strategy
- Integration: open adjustment period → assert a `kind=adjustment` `ReconciliationCycle` linked to the original `PeriodClose`, an `AuditLogEntry`, and a low-severity alert to both audiences; assert an insert dated in the closed period now succeeds while the window is open.
- Integration: after window expiry, assert inserts into that period are rejected again (auto-relock) and a treasurer cannot invoke the open action.
- Unit: action rejects missing reason / unconfirmed request.

## Dependencies
- Blocked By: — (none declared). Builds on US-046 (period-close flow) per the scope Prerequisites; tightly coupled to US-070 (the period-lock trigger whose exception this window drives).

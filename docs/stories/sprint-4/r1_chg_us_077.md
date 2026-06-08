# US-077: PWA visibly shows "guardado, esperando señal" when a write is queued offline

> **Sprint 4** | **P0** | **3 SP** | **R1** | REVIEW_F6

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-077 |
| Feature | REVIEW_F6 — PWA visibly shows "guardado, esperando señal" when a write is queued offline |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As a treasurer, I want to clearly see that my entry was saved offline, so that I don't re-enter it and create duplicates when the signal returns.

## Acceptance Criteria
- [ ] AC-1: When offline, the service worker queues the write with a `client_request_id` and the affected row shows an amber chip in es-EC: "Guardado. Se sincronizará cuando vuelva la señal".
- [ ] AC-2: The amber chip clears on successful sync of that write once connectivity returns.
- [ ] AC-3: The user can tap an indicator to see the count of queued (pending-sync) writes.
- [ ] AC-4: On reconnect, queued writes are flushed using their `client_request_id`; if the server already accepted that `client_request_id` (UNIQUE), the response is a silent dedupe — no error shown to the user, no duplicate row created.
- [ ] AC-5: The dedupe guarantee is org-scoped and end-to-end: the same `client_request_id` replayed never produces two persisted records.

## Technical Notes
- **Data model:** every mutable write carries a `client_request_id`; server enforces UNIQUE `client_request_id` (per relevant write table) so replays are idempotent. Add the column + UNIQUE constraint via HR-25 timestamp-slug migration (`slug=client_request_id_dedupe`) where missing.
- **API / surface:** PWA service-worker outbox (IndexedDB queue); UI amber-chip state on affected rows + a queued-count indicator. Write endpoints accept and dedupe on `client_request_id`.
- **Business-rule execution:** no locked BR; this is an offline-resilience / idempotency concern. Reinforces BR-16 (every movement append-only) by preventing accidental duplicate movements.
- **Multi-tenancy / audit:** queued writes carry the active `org_id`; dedupe and audit are org-scoped. A deduped replay produces no second audit entry.

## Test Strategy
- Unit: chip state transitions (queued → amber, synced → cleared); queued-count tally.
- Integration: go offline, submit a write (chip appears), reconnect (write flushes, chip clears, exactly one row persisted).
- Property: replaying the same `client_request_id` N times yields exactly one persisted record and no user-visible error (silent dedupe).

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-010 (PWA / offline foundation) and US-029 (the write path that gets queued).

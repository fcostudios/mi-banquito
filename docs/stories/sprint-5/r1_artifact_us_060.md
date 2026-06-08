# US-060: President receives monthly close PDF via WhatsApp from treasurer

> **Sprint 5** | **P0** | **3 SP** | **R1** | FEAT-060

## User Story

As the president (P02, artifact-only, no app login in R1), I want to receive the monthly close PDF over WhatsApp before the meeting, so that I walk in informed.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-060 |
| Feature | FEAT-060 — President receives monthly close PDF via WhatsApp from treasurer |
| Sprint | Sprint 5 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | (artifact only) |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-047 |
## Acceptance Criteria

- [ ] AC-1: From the `SCR-monthly-close` preview, the treasurer can invoke a WhatsApp share-intent that attaches the generated monthly-close PDF (US-047) and delivers it to the president.
- [ ] AC-2: This is artifact-only for R1 — the president needs no app login; receipt happens entirely inside WhatsApp (no in-app inbox is built).
- [ ] AC-3: The share-intent reuses the canonical share pattern (`pattern.share-via-whatsapp`, same as US-049) — a single tap opens the OS/WhatsApp share sheet with the PDF blob URL.
- [ ] AC-4: The system records the share-attempt as an `AuditLogEntry` (actor = treasurer, target = the `StatementArchive`/PDF), consistent with the WhatsApp-share audit behavior in US-049.

## Technical Notes
- **Data model:** no new entity — consumes the `StatementArchive` (`kind = monthly_close`) row and blob URL produced by US-047. Share-attempt recorded as an `AuditLogEntry`.
- **API / surface:** WhatsApp share-intent button on the `SCR-monthly-close` preview; no new screen. Web Share API / `wa.me` deep link with the blob URL, mirroring `pattern.share-via-whatsapp`.
- **Business-rule execution:** no numbered BR (Business Rules row = —); this is a distribution/artifact story (mini-journey S5/S6), not a ledger mutation.
- **Multi-tenancy / audit:** org-scoped; the only persisted effect is the share-attempt `AuditLogEntry`. No president row/account is created in R1.

## Test Strategy
- Unit: share-intent URL builder produces the correct `wa.me`/Web-Share payload with the PDF blob URL.
- Integration: invoking share from the preview records a share-attempt `AuditLogEntry`; assert no app-side president account is created.

## Dependencies
- `Blocked By` row is `—`; scope prerequisite US-047 (the monthly-close PDF + `StatementArchive` must exist before it can be shared). Shares the WhatsApp share pattern with US-049.

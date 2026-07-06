# US-049: Treasurer shares a statement via WhatsApp share intent

> **Sprint 6** | **P1** | **3 SP** | **R1** | FEAT-049

## User Story

As a treasurer, I want to send a member their statement in one tap via the WhatsApp share intent, so that WhatsApp stays the channel and the system makes delivery frictionless.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-049 |
| Feature | FEAT-049 — Treasurer shares a statement via WhatsApp share intent |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant reporting |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-048 |
## Acceptance Criteria

- [x] AC-1: On `SCR-statements-archive` (`/estados`), each statement row exposes a per-row "Compartir por WhatsApp" action.
- [x] AC-2: Triggering the action opens the WhatsApp share intent pre-targeted to the member's WhatsApp number with the statement PDF (the `StatementArchive.pdf_uri` blob URL) attached, following `pattern.share-via-whatsapp`.
- [x] AC-3: The system records each share attempt as an `AuditLogEntry` (`action_kind=statement.shared`, `subject_kind=StatementArchive`, `subject_id`, `payload_snapshot` includes the target member + channel = whatsapp) — the audit captures the attempt regardless of whether WhatsApp delivery succeeds (delivery is external).
- [x] AC-4: The action is available only for an already-generated statement (an existing `StatementArchive` row with a resolvable `pdf_uri`); rows without a generated PDF do not show the share action.
- [x] AC-5: Sharing is non-mutating to the ledger and to `StatementArchive` (append-only respected); only the audit row is written.

## Technical Notes
- **Data model:** No new entity. Reads `StatementArchive` (`pdf_uri`, `member_id`) + `Member.whatsapp` number; writes one `AuditLogEntry`.
- **API / surface:** Client-side share via the `pattern.share-via-whatsapp` helper (Web Share API / `wa.me` deep link with the blob URL); a thin Server Action `recordStatementShare(statementId)` persists the audit entry. Screen: `SCR-statements-archive` (`/estados`).
- **Business-rule execution:** No BR governs this story (Business Rules row `—`).
- **Multi-tenancy / audit:** `org_id`-scoped; the share audit row written in the same Server Action transaction.

## Test Strategy
- Integration: invoking share on a row with a generated PDF writes exactly one `statement.shared` audit row pointing at the correct `StatementArchive`.
- Unit: WhatsApp deep-link/share-intent builder produces the correct `wa.me`/Web-Share payload for a given member number + blob URL.
- Integration: a row without a generated statement exposes no share action.

## Dependencies
- US-048 — the per-member statement (`StatementArchive` + `pdf_uri`) must exist before it can be shared (scope Prerequisite). Meta `Blocked By` is `—`.

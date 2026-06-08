# US-042: Treasurer shares a chase message via WhatsApp from a late row

> **Sprint 4** | **P0** | **3 SP** | **R1** | FEAT-042

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-042 |
| Feature | FEAT-042 — Treasurer shares a chase message via WhatsApp from a late row |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | Tenant collections |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-040 |
## User Story
As a treasurer, I want to send a warm-but-firm chase message in one tap from a late row, so that I don't have to draft the wording each time.

## Acceptance Criteria
- [ ] AC-1: From an SCR-ar-aging row, the action "Avisar por WhatsApp" opens the WhatsApp share intent (`https://wa.me/<number>?text=...`) targeting the member's WhatsApp number.
- [ ] AC-2: The message is pre-filled in es-EC using the template: "Hola {member}, te comparto que tu {aporte/cuota} de {period} aún está pendiente. ¿Cuándo crees poder hacerlo? — Mi Banquito." with `{member}`, `{aporte/cuota}`, `{period}` interpolated from the row.
- [ ] AC-3: The system records the share-attempt as an audit entry — `(member_id, source_ref, channel=whatsapp, message_template_id, attempted_at, attempted_by)` — capturing intent regardless of whether the message is actually sent (the share intent leaves the app).
- [ ] AC-4: If the member has no WhatsApp number on file, the action is disabled (or prompts to add a number) rather than opening a malformed intent.
- [ ] AC-5: The action is org-scoped; the template text and member data resolve only within the active group.

## Technical Notes
- **Data model:** no new persisted entity for the message; the share-attempt is an append-only audit-log row (BR-16 trust spine). Reuses member contact (`whatsapp_number`).
- **API / surface:** client builds the `wa.me` deep link from row context; a server action `RecordChaseAttempt(...)` writes the audit entry. Surface: SCR-ar-aging (`pattern.share-via-whatsapp`).
- **Business-rule execution:** no locked BR. The es-EC template wording is fixed copy (subject to OQ-BR / brand vocabulary validation).
- **Multi-tenancy / audit:** `org_id`-scoped read of member + period; the share-attempt is audited per BR-16 so chase activity is transparent and reviewable.

## Test Strategy
- Unit: template interpolation produces the exact es-EC string for aporte vs cuota; URL-encoding of the `text` param.
- Integration: tapping the action writes one audit entry and constructs a valid `wa.me` link; a member without a number disables the action.
- Property: the audit entry is always written before/independent of the external intent (no silent loss).

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisite per scope: US-040 (the A/R aging row supplies member, period, amount, and number for the message).

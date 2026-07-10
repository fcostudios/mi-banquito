# US-059: Member receives statement via WhatsApp from treasurer

> **Sprint 6** | **P1** | **3 SP** | **R1** | FEAT-059

## User Story

As a Member (P03), I want to receive my statement on WhatsApp, so that I have proof of my balance — without needing to log into the app in R1.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-059 |
| Feature | FEAT-059 — Member receives statement via WhatsApp from treasurer |
| Sprint | Sprint 6 |
| Priority | P1 |
| Size | 3 SP |
| Release | R1 |
| Domain | (artifact only) |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-049 |
> **Artifact-only story.** There is no app behavior to build for the member in R1 — the member has no app login. This capability is fully achieved by the treasurer-driven flow in **US-049**; the member's "behavior" is simply opening the PDF preview that arrives over WhatsApp. It is recorded as a story so the member-facing outcome is traceable.

## Acceptance Criteria
- [ ] AC-1: The member receives the statement PDF over WhatsApp as a result of the treasurer's share action (US-049) — no member-side app surface is built.
- [ ] AC-2: The member can open the PDF preview in WhatsApp (the WhatsApp PDF preview is the surface; `n/a` screen in this app).
- [ ] AC-3: No member login, account, or in-app screen is required or created in R1.

## Technical Notes
- **Data model:** None. No entity is created or modified by this story.
- **API / surface:** None in this app. Surface is the WhatsApp PDF preview produced by US-049's share intent. Screens: n/a.
- **Business-rule execution:** No BR governs this story (Business Rules row `—`).
- **Multi-tenancy / audit:** The share itself (and its audit) is owned by US-049; nothing additional is recorded here.

## Test Strategy
- Covered transitively by US-049's share-intent and audit tests; this story has no independent code to test (artifact-only).

## Dependencies
- US-049 — the treasurer WhatsApp share intent delivers the statement; this story is its member-facing outcome (scope Prerequisite). Meta `Blocked By` is `—`.

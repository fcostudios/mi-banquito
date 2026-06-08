# US-085: Public statement-verifier endpoint accepts hash + returns "matches / does not match"

> **Sprint 4** | **P0** | **3 SP** | **R1** | REVIEW_F24

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-085 |
| Feature | REVIEW_F24 — Public statement-verifier endpoint accepts hash + returns "matches / does not ma |
| Sprint | Sprint 4 |
| Priority | P0 |
| Size | 3 SP |
| Release | R1 |
| Domain | review/chg |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | — |

## User Story
As any member or president, I want to paste the hash from a PDF footer and confirm the PDF is genuine, so that the integrity hash actually builds trust instead of being decorative.

## Acceptance Criteria
- [ ] AC-1: A public route `GET /verify/[hash]` requires no authentication and looks up `StatementArchive` by `canonical_payload_hash = hash`.
- [ ] AC-2: On a match it returns minimal JSON plus an es-EC HTML page: "Este documento coincide con el registro del grupo {group_name} al {generated_at}".
- [ ] AC-3: On no match it returns the es-EC page: "No se encontró un documento con este código" (and a non-2xx/empty-result JSON), without leaking any other group's data.
- [ ] AC-4: Every generated statement PDF footer is extended with a QR code linking to the `/verify/[hash]` URL plus the plain-Spanish callout "Toca el código QR para verificar".
- [ ] AC-5: The endpoint reveals only `group_name` + `generated_at` for a matched archive — never member-level financial detail (public, unauthenticated surface).

## Technical Notes
- **Data model:** read-only lookup on `StatementArchive.canonical_payload_hash` (the canonical-JSON SHA-256 produced by US-047/US-048). No schema change beyond ensuring `canonical_payload_hash` is indexed for the public lookup (HR-25 timestamp-slug migration `slug=statement_hash_index` if needed).
- **API / surface:** public unauthenticated route `GET /verify/[hash]` (JSON + HTML); SCR-public-verify-pdf. PDF generation extended to embed the QR + callout in the footer.
- **Business-rule execution:** no locked BR; this realizes the brand promise that the hash is a member-facing trust signal. Composes with BR-18/CHG-003 (year-end immutable snapshot hashes) which seed verifiable archives.
- **Multi-tenancy / audit:** the route is intentionally cross-tenant *by hash* (anyone may verify any group's published PDF), but exposes only `group_name` + `generated_at` — no PII, no financial lines. A miss returns a generic "not found" (no enumeration of which groups exist).

## Test Strategy
- Unit: hash lookup hit vs miss; response shape for both; the minimal-disclosure projection (only group_name + generated_at).
- Integration: a real generated PDF's footer hash resolves to its `StatementArchive`; a tampered/edited PDF's recomputed hash returns "no se encontró".
- Security: unauthenticated access succeeds; no member financial field is ever returned; a random/garbage hash returns the generic not-found page.

## Dependencies
- Blocked By: — (no story-level blocker declared). Functional prerequisites per scope: US-047 (canonical-JSON hash generation) and US-048 (statement archive / PDF pipeline).

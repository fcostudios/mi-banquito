# US-072: System enforces cross-tenant safety via Postgres RLS plus auth session var

> **Sprint 3** | **P0** | **8 SP** | **R1** | FEAT-072

## User Story

As the system, I want to reject any query that doesn't carry the correct org_id, so that NFR-SEC-01 holds even when an app-layer predicate is forgotten.

## Meta

| Field | Value |
|-------|-------|
| Story ID | US-072 |
| Feature | FEAT-072 — System enforces cross-tenant safety via Postgres RLS plus auth session var |
| Sprint | Sprint 3 |
| Priority | P0 |
| Size | 5 SP |
| Release | R1 |
| Domain | Substrate |
| Business Rules | — |
| Backstage Process | — |
| Blocked By | US-008, US-011 |
## Acceptance Criteria

- [ ] AC-1: **Row-Level Security (RLS) policies** are enabled on **every tenant table** (every table carrying `org_id`), restricting visible/affected rows to those matching the current session's org.
- [ ] AC-2: The active org is carried in a **Postgres session variable** (auth session var, e.g. `app.current_org`) set from the authenticated session at the start of each request/transaction; the RLS policy predicate compares `org_id` to that session var.
- [ ] AC-3: An **integration test creates two orgs** and verifies that queries issued under an **org-A session cannot see (or update/delete) org-B rows** — across SELECT/INSERT/UPDATE/DELETE.
- [ ] AC-4: A query issued **without** the session var set sees **no tenant rows** (fail-closed), so a forgotten app-layer predicate cannot leak data.
- [ ] AC-5: Behavior is **documented** (migration + dev note) and **gated in CI** — a test asserts RLS is enabled on every `org_id`-bearing table (a new tenant table without RLS fails CI).
- [ ] AC-6: A controlled, audited **bypass path** exists only for legitimate platform-operator/system operations (e.g. a `BYPASSRLS`/elevated role); ordinary treasurer sessions never bypass RLS.

## Technical Notes
- **Data model:** no column changes (relies on the substrate-wide `org_id`); adds `ENABLE ROW LEVEL SECURITY` + a `USING`/`WITH CHECK` policy per tenant table, plus a session-var convention. New migration per HR-25: `V<UTC-timestamp>__cross_tenant_rls_policies.sql` (Meta `slug=cross-tenant-rls-policies`).
- **API / surface:** none (DB-level); the data-access layer sets the org session var (`SET LOCAL app.current_org = …`) at request/transaction start from the auth session.
- **Business-rule execution:** enforces NFR-SEC-01 (cross-tenant isolation) — the defense-in-depth backstop beneath app-layer org predicates.
- **Multi-tenancy / audit:** this story IS the multi-tenancy enforcement primitive; composes with append-only (US-069), period-lock (US-070), and audit atomicity (US-071). Operator impersonation (read-only, R1) still resolves through a scoped/elevated path, audited via `AuditLogEntry`.

## Test Strategy
- Integration: two-org fixture; assert org-A session cannot read/write org-B rows on SELECT/INSERT/UPDATE/DELETE; assert no-session-var → zero tenant rows (fail-closed).
- CI gate: enumerate `org_id`-bearing tables and assert RLS enabled + policy present on each (new unguarded table fails the test).

## Dependencies
- Blocked By: — (none declared). Builds on US-008 (base schema) and US-011 (auth/org session context that supplies the session var) per the scope Prerequisites.

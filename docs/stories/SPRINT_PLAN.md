<!-- nous-sprint-stamp
generated_at: 2026-06-08T02:33:49Z
current_sprint: sprint-12
sprints_hash: a81073114fb755ff
-->
# Mi Banquito — Sprint Execution Plan

> **Auto-generated from nous.db.** Read this before starting any story.
> Regenerate: `nous_trace.py sprint-plan --output docs/stories/SPRINT_PLAN.md`

## Where Code Goes

| Story Target | Code Location |
|---|---|
| **backend** | `apps/web/src/app/api/<route>/route.ts` (serverless API routes) |
| **frontend** | `apps/web/src/components/` or `apps/web/src/app/<route>/` |
| **full-stack** | Both the API route handler + frontend UI (one Next.js app) |

See `docs/specs/09_architecture.md` for bounded context details.

---

## Sprint 0: Sprint 0

**Stories:** 15 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-001** ⬜ | Initialize Turborepo monorepo with apps/web and 5 packages | ? ?SP | `See story file` | — | US-047 | →4 | — | [r1_foundation_us_001.md](sprint-0/r1_foundation_us_001.md) |
| 2 | full-stack | **US-002** ⬜ | Provision Vercel project with custom domain and preview deploys | ? ?SP | `See story file` | — | US-001 | →5 | — | [r1_foundation_us_002.md](sprint-0/r1_foundation_us_002.md) |
| 3 | full-stack | **US-003** ⬜ | Provision Neon project with branching per Vercel preview | ? ?SP | `See story file` | — | US-002 | →4 | — | [r1_foundation_us_003.md](sprint-0/r1_foundation_us_003.md) |
| 4 | full-stack | **US-004** ⬜ | Provision Auth0 tenant with Organizations and FcoStudios org | ? ?SP | `See story file` | — | US-002, US-047 | →10 | — | [r1_foundation_us_004.md](sprint-0/r1_foundation_us_004.md) |
| 5 | full-stack | **US-009** ⬜ | Set up Tailwind 4 with design tokens and strings.es-EC.json and Lucide allow-list | ? ?SP | `See story file` | — | US-007 | →3 | — | [r1_foundation_us_009.md](sprint-0/r1_foundation_us_009.md) |
| 6 | full-stack | **US-005** ⬜ | Provision Vercel Blob store and Sentry project and Better Stack monitor | ? ?SP | `See story file` | — | US-002, US-004 | →6 | — | [r1_foundation_us_005.md](sprint-0/r1_foundation_us_005.md) |
| 7 | full-stack | **US-007** ⬜ | Set up Next.js 16 App Router with treasurer and admin route groups | ? ?SP | `See story file` | — | US-001, US-005 | →4 | — | [r1_foundation_us_007.md](sprint-0/r1_foundation_us_007.md) |
| 8 | backend | **US-008** ⬜ | Set up Drizzle initial migration with 29 entity tables RLS triggers materialized views | ? ?SP | `apps/web/src/app/api/` | — | US-003, US-007 | →29 | — | [r1_foundation_us_008.md](sprint-0/r1_foundation_us_008.md) |
| 9 | full-stack | **US-010** ⬜ | Set up Serwist service worker and PWA manifest installable Android and iOS | ? ?SP | `See story file` | — | US-009, US-064, US-062 | — | — | [r1_foundation_us_010.md](sprint-0/r1_foundation_us_010.md) |
| 10 | full-stack | **US-011** ⬜ | Set up auth middleware Auth0 session extraction and Postgres RLS session var | ? ?SP | `See story file` | — | US-008, US-064, US-004 | →7 | — | [r1_foundation_us_011.md](sprint-0/r1_foundation_us_011.md) |
| 11 | backend | **US-013** ⬜ | Set up CI pipeline type-check lint test Drizzle migration check axe a11y | ? ?SP | `apps/web/src/app/api/` | — | US-001, US-064, US-004 | →2 | — | [r1_foundation_us_013.md](sprint-0/r1_foundation_us_013.md) |
| 12 | full-stack | **US-014** ⬜ | Set up business-rule test infrastructure golden files property-based | ? ?SP | `See story file` | — | US-001, US-013, US-045 | →2 | — | [r1_foundation_us_014.md](sprint-0/r1_foundation_us_014.md) |
| 13 | full-stack | **US-006** ⬜ | Configure environment variables for local preview and prod | ? ?SP | `See story file` | — | US-003, US-004, US-005 | — | — | [r1_foundation_us_006.md](sprint-0/r1_foundation_us_006.md) |
| 14 | full-stack | **US-012** ⬜ | Set up Vercel Cron config for daily interest and treasurer compensation and drift sweep | ? ?SP | `See story file` | — | US-007, US-011, US-013 | →6 | — | [r1_foundation_us_012.md](sprint-0/r1_foundation_us_012.md) |
| 15 | full-stack | **US-015** ⬜ | Set up Auth0 magic-link passwordless email flow | ? ?SP | `See story file` | — | US-004, US-007, US-011 | →2 | — | [r1_foundation_us_015.md](sprint-0/r1_foundation_us_015.md) |

### Parallel Tracks

**Backend (2 stories):** US-008 → US-013
**Full-stack (13 stories):** US-001 → US-002 → US-003 → US-004 → US-009 → US-005 → US-007 → US-010 → US-011 → US-014 → US-006 → US-012 → US-015

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 1: Sprint 1

**Stories:** 10 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-016** ⬜ | Platform operator creates a new tenant organization | ? ?SP | `See story file` | — | US-011, US-015, US-064 | →4 | — | [r1_admin_us_016.md](sprint-1/r1_admin_us_016.md) |
| 2 | full-stack | **US-025** ⬜ | Treasurer first-run group setup wizard 3 screens | ? ?SP | `See story file` | — | US-018, US-005 | →7 | — | [r1_onboarding_us_025.md](sprint-1/r1_onboarding_us_025.md) |
| 3 | full-stack | **US-017** ⬜ | Platform operator configures group rules including 11 business rules | ? ?SP | `See story file` | — | US-016, US-011, US-004 | →8 | — | [r1_admin_us_017.md](sprint-1/r1_admin_us_017.md) |
| 4 | full-stack | **US-026** ⬜ | Treasurer adds a member with name WhatsApp number role initial savings | ? ?SP | `See story file` | — | US-025 | →6 | — | [r1_ledger_us_026.md](sprint-1/r1_ledger_us_026.md) |
| 5 | full-stack | **US-031** ⬜ | Treasurer views live compliance state per member with green amber red encoding | ? ?SP | `See story file` | — | US-008, US-029, US-040 | →3 | — | [r1_ledger_us_031.md](sprint-1/r1_ledger_us_031.md) |
| 6 | full-stack | **US-027** ⬜ | Treasurer changes a member status to en pausa or baja with refund A/P entry | ? ?SP | `See story file` | — | US-026, US-025 | — | — | [r1_ledger_us_027.md](sprint-1/r1_ledger_us_027.md) |
| 7 | full-stack | **US-028** ⬜ | Treasurer views and edits group rules read-only first then edits with HR-1 versioning | ? ?SP | `See story file` | — | US-025, US-020, US-026 | →3 | — | [r1_config_us_028.md](sprint-1/r1_config_us_028.md) |
| 8 | full-stack | **US-029** ⬜ | Treasurer records a contribution with slip photo and optional notes | ? ?SP | `See story file` | — | US-008, US-009, US-026 | →6 | — | [r1_ledger_us_029.md](sprint-1/r1_ledger_us_029.md) |
| 9 | full-stack | **US-030** ⬜ | Treasurer reverses a prior contribution with required reason | ? ?SP | `See story file` | — | US-029, US-002, US-028 | — | — | [r1_ledger_us_030.md](sprint-1/r1_ledger_us_030.md) |
| 10 | full-stack | **US-032** ⬜ | Treasurer records the annual base fund quota payment for a member | ? ?SP | `See story file` | — | US-008, US-017, US-026 | — | — | [r1_ledger_us_032.md](sprint-1/r1_ledger_us_032.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 2: Sprint 2

**Stories:** 10 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-033** ✅ | Treasurer originates a member loan declining-balance schedule auto-generated | ? ?SP | `See story file` | — | US-008, US-014, US-017 | →5 | — | [r1_loans_us_033.md](sprint-2/r1_loans_us_033.md) |
| 2 | full-stack | **US-038** ✅ | System fires daily interest accrual cron idempotent on loan_id and accrued_on | ? ?SP | `See story file` | — | US-008, US-012, US-003 | →1 | — | [r1_loans_us_038.md](sprint-2/r1_loans_us_038.md) |
| 3 | full-stack | **US-074** ✅ | Treasurer records a contribution as cash, bank, or petty cash | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_074.md](sprint-2/r1_chg_us_074.md) |
| 4 | full-stack | **US-075** ✅ | System supports a "partial aporte" state and treasurer records partial payments | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_075.md](sprint-2/r1_chg_us_075.md) |
| 5 | full-stack | **US-081** ✅ | Operator views cron run history and triggers manual replay | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_081.md](sprint-2/r1_chg_us_081.md) |
| 6 | full-stack | **US-034** ✅ | Treasurer originates a non-member loan with required guarantor picker | ? ?SP | `See story file` | — | US-008, US-017, US-033 | →2 | — | [r1_loans_us_034.md](sprint-2/r1_loans_us_034.md) |
| 7 | full-stack | **US-036** ✅ | Treasurer records a loan repayment with auto split interest first | ? ?SP | `See story file` | — | US-008, US-014, US-033 | →4 | — | [r1_loans_us_036.md](sprint-2/r1_loans_us_036.md) |
| 8 | full-stack | **US-035** ✅ | Treasurer optionally designates a referrer member on origination | ? ?SP | `See story file` | — | US-017, US-034, US-025 | →1 | — | [r1_loans_us_035.md](sprint-2/r1_loans_us_035.md) |
| 9 | full-stack | **US-037** ✅ | Treasurer views loan detail with schedule fees repayments accruals referrer guarantor | ? ?SP | `See story file` | — | US-033, US-036, US-004 | — | — | [r1_loans_us_037.md](sprint-2/r1_loans_us_037.md) |
| 10 | full-stack | **US-039** ✅ | System fires referral commission credit on Loan status pagado | ? ?SP | `See story file` | — | US-035, US-036, US-003 | — | — | [r1_loans_us_039.md](sprint-2/r1_loans_us_039.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 3: Sprint 3

**Stories:** 10 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-024** ⬜ | Platform operator views per-org business-rules panel | ? ?SP | `See story file` | — | US-017, US-020 | — | — | [r1_admin_us_024.md](sprint-3/r1_admin_us_024.md) |
| 2 | full-stack | **US-055** ⬜ | Treasurer views and acts on the alerts bell with dismiss snooze and Avisar | ? ?SP | `See story file` | — | US-008, US-062 | — | — | [r1_alerts_us_055.md](sprint-3/r1_alerts_us_055.md) |
| 3 | full-stack | **US-056** ⬜ | Treasurer views Historial as plain-Spanish audit narration | ? ?SP | `See story file` | — | US-008, US-063 | →2 | — | [r1_audit_us_056.md](sprint-3/r1_audit_us_056.md) |
| 4 | full-stack | **US-069** ⬜ | System enforces append-only ledger via Postgres row triggers | ? ?SP | `See story file` | — | US-008 | →2 | — | [r1_substrate_us_069.md](sprint-3/r1_substrate_us_069.md) |
| 5 | full-stack | **US-070** ⬜ | System enforces period-lock immutability via Postgres row trigger | ? ?SP | `See story file` | — | US-008 | — | — | [r1_substrate_us_070.md](sprint-3/r1_substrate_us_070.md) |
| 6 | full-stack | **US-071** ⬜ | System enforces audit-write-failure rollback via same-transaction pattern | ? ?SP | `See story file` | — | US-008 | →4 | — | [r1_substrate_us_071.md](sprint-3/r1_substrate_us_071.md) |
| 7 | full-stack | **US-072** ⬜ | System enforces cross-tenant safety via Postgres RLS plus auth session var | ? ?SP | `See story file` | — | US-008, US-011 | — | — | [r1_substrate_us_072.md](sprint-3/r1_substrate_us_072.md) |
| 8 | full-stack | **US-073** ⬜ | System captures errors with PII redaction in Sentry | ? ?SP | `See story file` | — | US-005 | — | — | [r1_observability_us_073.md](sprint-3/r1_observability_us_073.md) |
| 9 | full-stack | **US-083** ⬜ | Operator opens an adjustment period after a locked monthly close | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_083.md](sprint-3/r1_chg_us_083.md) |
| 10 | full-stack | **US-057** ⬜ | Treasurer searches Historial by member kind and date range | ? ?SP | `See story file` | — | US-056, US-063, US-067 | — | — | [r1_audit_us_057.md](sprint-3/r1_audit_us_057.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 4: Sprint 4

**Stories:** 10 | **Points:** 0 SP

> **Status:** Closed / shipped. Two accepted downstream evidence items remain:
> US-050 monthly-close PDF visibility waits for the monthly close PDF story, and
> US-085 QR/footer embedding waits for statement PDF generation.

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-040** ✅ | Treasurer views the A/R aging primary tab sorted by days-late descending | ? ?SP | `See story file` | — | US-008, US-029, US-036 | →5 | — | [r1_collections_us_040.md](sprint-4/r1_collections_us_040.md) |
| 2 | full-stack | **US-050** ✅ | System awards treasurer compensation per cron with idempotency | ? ?SP | `See story file` | — | US-012, US-017, US-047 | — | — | [r1_reporting_us_050.md](sprint-4/r1_reporting_us_050.md) |
| 3 | full-stack | **US-054** ✅ | Treasurer views Liquidez Proyectada single screen with sandbox | ? ?SP | `See story file` | — | US-008, US-064, US-062 | →2 | — | [r1_liquidity_us_054.md](sprint-4/r1_liquidity_us_054.md) |
| 4 | full-stack | **US-076** ✅ | Treasurer declares loan disbursement source (bank vs cash) at origination | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_076.md](sprint-4/r1_chg_us_076.md) |
| 5 | full-stack | **US-077** ✅ | PWA visibly shows "guardado, esperando señal" when a write is queued offline | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_077.md](sprint-4/r1_chg_us_077.md) |
| 6 | full-stack | **US-085** ✅ | Public statement-verifier endpoint accepts hash + returns "matches / does not match" | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_085.md](sprint-4/r1_chg_us_085.md) |
| 7 | full-stack | **US-087** ✅ | Operator runs the design-partner onboarding ceremony with parity-check log | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_087.md](sprint-4/r1_chg_us_087.md) |
| 8 | full-stack | **US-041** ✅ | Treasurer marks a promise on a late row with a date | ? ?SP | `See story file` | — | US-040, US-064 | →2 | — | [r1_collections_us_041.md](sprint-4/r1_collections_us_041.md) |
| 9 | full-stack | **US-043** ✅ | System surfaces promise on the promised date as a reminder | ? ?SP | `See story file` | — | US-041 | — | — | [r1_alerts_us_043.md](sprint-4/r1_alerts_us_043.md) |
| 10 | full-stack | **US-042** ✅ | Treasurer shares a chase message via WhatsApp from a late row | ? ?SP | `See story file` | — | US-040, US-005, US-041 | — | — | [r1_collections_us_042.md](sprint-4/r1_collections_us_042.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 5: Sprint 5

**Stories:** 10 | **Points:** 0 SP

> **Status:** Closed for the monthly-close operating slice. The `/cierre`
> workflow, A7/A8 alerting, platform bootstrap, org lifecycle guardrails,
> migrations, Vercel Blob monthly-close PDF artifact, authenticated archive
> route, hash verifier, and archive listing are shipped and verified.
>
> **Carry-over to Sprint 6:** US-060 still needs artifact delivery that a
> president can open without app login, and US-086 still needs the live
> per-member monthly PDF and year-end PDF generators. The shared PDF template
> already supports the richer sections; the missing work is generation and
> delivery for those artifact types.

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-044** ✅ | Treasurer enters declared bank balance and sees discrepancy in cierre flow | ? ?SP | `See story file` | — | US-008, US-029, US-036 | →4 | — | [r1_reconciliation_us_044.md](sprint-5/r1_reconciliation_us_044.md) |
| 2 | full-stack | **US-079** ✅ | Operator bootstraps the FcoStudios platform organization | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_079.md](sprint-5/r1_chg_us_079.md) |
| 3 | full-stack | **US-080** ✅ | Operator freezes or archives a tenant organization with audit trail | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_080.md](sprint-5/r1_chg_us_080.md) |
| 4 | full-stack | **US-086** ↗ | Per-member statement PDF + year-end PDF explain content richly | ? ?SP | `See story file` | — | US-048, US-053 | →1 | — | [r1_chg_us_086.md](sprint-5/r1_chg_us_086.md) |
| 5 | full-stack | **US-088** ✅ | System emits A8 *Período no cerrado en últimos N días* (Medium, treasurer + plat | ? ?SP | `See story file` | — | US-008, US-012, US-019 | — | — | [r1_chg_us_088.md](sprint-5/r1_chg_us_088.md) |
| 6 | full-stack | **US-045** ✅ | Treasurer annotates a discrepancy outside tolerance with required reason | ? ?SP | `See story file` | — | US-044 | →2 | — | [r1_reconciliation_us_045.md](sprint-5/r1_reconciliation_us_045.md) |
| 7 | full-stack | **US-047** ✅ | System generates the monthly close PDF with canonical-JSON SHA-256 hash | ? ?SP | `See story file` | — | US-046, US-064, US-059 | →8 | — | [r1_reporting_us_047.md](sprint-5/r1_reporting_us_047.md) |
| 8 | full-stack | **US-060** ↗ | President receives monthly close PDF via WhatsApp from treasurer | ? ?SP | `See story file` | — | US-047 | — | — | [r1_artifact_us_060.md](sprint-5/r1_artifact_us_060.md) |
| 9 | full-stack | **US-067** ✅ | System emits A7 discrepancia bancaria detectada alert | ? ?SP | `See story file` | — | US-044 | →1 | — | [r1_alerts_us_067.md](sprint-5/r1_alerts_us_067.md) |
| 10 | full-stack | **US-046** ✅ | Treasurer locks the monthly close and the period becomes immutable | ? ?SP | `See story file` | — | US-045, US-044 | →6 | — | [r1_reconciliation_us_046.md](sprint-5/r1_reconciliation_us_046.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 6: Sprint 6

**Stories:** 10 | **Points:** 0 SP

> **Carry-over intake:** Finish US-060 public/signed monthly-close PDF delivery
> for president WhatsApp sharing, and finish US-086 generation for
> `member_monthly` and `year_end` archives while implementing US-048, US-049,
> US-053, and US-059.

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-051** ✅ | Treasurer opens year-end share-out wizard with time-weighted breakdown by source | ? ?SP | `See story file` | — | US-008, US-046, US-100 | →3 | — | [r1_reporting_us_051.md](sprint-6/r1_reporting_us_051.md) |
| 2 | full-stack | **US-058** ✅ | Treasurer views balance for any member via partial-name search on home | ? ?SP | `See story file` | — | US-026, US-031, US-056 | — | — | [r1_ledger_us_058.md](sprint-6/r1_ledger_us_058.md) |
| 3 | full-stack | **US-061** ✅ | System emits A1 conciliacion pendiente alert | ? ?SP | `See story file` | — | US-008, US-012 | — | — | [r1_alerts_us_061.md](sprint-6/r1_alerts_us_061.md) |
| 4 | full-stack | **US-062** ✅ | System emits A2 prestamo proximo a vencer alert | ? ?SP | `See story file` | — | US-008, US-040 | →7 | — | [r1_alerts_us_062.md](sprint-6/r1_alerts_us_062.md) |
| 5 | full-stack | **US-049** ✅ | Treasurer shares a statement via WhatsApp share intent | ? ?SP | `See story file` | — | US-048, US-047 | →1 | — | [r1_reporting_us_049.md](sprint-6/r1_reporting_us_049.md) |
| 6 | full-stack | **US-059** ✅ | Member receives statement via WhatsApp from treasurer | ? ?SP | `See story file` | — | US-049 | →2 | — | [r1_artifact_us_059.md](sprint-6/r1_artifact_us_059.md) |
| 7 | full-stack | **US-063** ✅ | System emits A3 aporte atrasado alert | ? ?SP | `See story file` | — | US-062, US-008, US-031 | →4 | — | [r1_alerts_us_063.md](sprint-6/r1_alerts_us_063.md) |
| 8 | full-stack | **US-048** ✅ | Treasurer generates per-member statements as a batch and individually | ? ?SP | `See story file` | — | US-046, US-047, US-062 | →2 | — | [r1_reporting_us_048.md](sprint-6/r1_reporting_us_048.md) |
| 9 | full-stack | **US-052** ✅ | Treasurer overrides a per-member share with required reason and audit | ? ?SP | `See story file` | — | US-051, US-113, US-048 | →1 | — | [r1_reporting_us_052.md](sprint-6/r1_reporting_us_052.md) |
| 10 | full-stack | **US-053** ✅ | Treasurer approves year-end share-out which writes payouts and PDFs | ? ?SP | `See story file` | — | US-051, US-052, US-105 | →2 | — | [r1_reporting_us_053.md](sprint-6/r1_reporting_us_053.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 7: Sprint 7

**Stories:** 10 | **Points:** 0 SP

> **Status:** Closed / shipped. Verification completed with schema verification,
> full test suite, type-check, lint, and production build on 2026-07-08.

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-064** ✅ | System emits A4 liquidez bajo margen alert | ? ?SP | `See story file` | — | US-062, US-054 | →12 | — | [r1_alerts_us_064.md](sprint-7/r1_alerts_us_064.md) |
| 2 | full-stack | **US-066** ✅ | System emits A6 prestamo en mora alert | ? ?SP | `See story file` | — | US-033, US-034, US-040 | — | — | [r1_alerts_us_066.md](sprint-7/r1_alerts_us_066.md) |
| 3 | full-stack | **US-068** ✅ | System emits A14 saldo de miembro negativo alert | ? ?SP | `See story file` | — | US-031 | →3 | — | [r1_alerts_us_068.md](sprint-7/r1_alerts_us_068.md) |
| 4 | full-stack | **US-078** ✅ | Treasurer marks a chase-promise with date + receives a reminder | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_078.md](sprint-7/r1_chg_us_078.md) |
| 5 | full-stack | **US-082** ✅ | Operator re-issues a magic-link from /admin when treasurer cannot log in | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_082.md](sprint-7/r1_chg_us_082.md) |
| 6 | full-stack | **US-084** ✅ | Treasurer reverses an approved year-end share-out within grace window | ? ?SP | `See story file` | — | — | — | — | [r1_chg_us_084.md](sprint-7/r1_chg_us_084.md) |
| 7 | full-stack | **US-089** ✅ | System emits A9 *Cambio de configuración del grupo* (Low, treasurer) | ? ?SP | `See story file` | — | US-017, US-028 | — | — | [r1_chg_us_089.md](sprint-7/r1_chg_us_089.md) |
| 8 | full-stack | **US-090** ✅ | System emits A11 *Aporte sin foto de comprobante (≥ N consecutivos)* (Low, treas | ? ?SP | `See story file` | — | US-008, US-029 | — | — | [r1_chg_us_090.md](sprint-7/r1_chg_us_090.md) |
| 9 | full-stack | **US-018** ✅ | Platform operator invites the treasurer via Auth0 organization invite | ? ?SP | `See story file` | — | US-015, US-064, US-016 | →2 | — | [r1_admin_us_018.md](sprint-7/r1_admin_us_018.md) |
| 10 | full-stack | **US-065** ✅ | System emits A5 compromiso reparto excede proyeccion alert | ? ?SP | `See story file` | — | US-051, US-054, US-064 | — | — | [r1_alerts_us_065.md](sprint-7/r1_alerts_us_065.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 8: Sprint 8

**Stories:** 10 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-019** ⬜ | Platform operator views per-org health snapshot on admin home | ? ?SP | `See story file` | — | US-008, US-011, US-017 | →1 | — | [r1_admin_us_019.md](sprint-8/r1_admin_us_019.md) |
| 2 | full-stack | **US-020** ⬜ | Platform operator starts read-only impersonation with required reason | ? ?SP | `See story file` | — | US-016, US-025, US-004 | →5 | — | [r1_admin_us_020.md](sprint-8/r1_admin_us_020.md) |
| 3 | full-stack | **US-091** ⬜ | Treasurer sets up and manages the group's accounts | ? ?SP | `See story file` | CHG-001 | — | →2 | — | [r1_chg_us_091.md](sprint-8/r1_chg_us_091.md) |
| 4 | full-stack | **US-092** ⬜ | Treasurer records a categorized fund movement (fee / supplies / shared expense) | ? ?SP | `See story file` | CHG-001 | — | →1 | — | [r1_chg_us_092.md](sprint-8/r1_chg_us_092.md) |
| 5 | full-stack | **US-093** ⬜ | Treasurer records an inter-account transfer (bookkeeping) | ? ?SP | `See story file` | CHG-001 | — | — | — | [r1_chg_us_093.md](sprint-8/r1_chg_us_093.md) |
| 6 | full-stack | **US-094** ⬜ | Treasurer regularizes a deposit that landed in a non-group account *(crown jewel | ? ?SP | `See story file` | CHG-001 | — | — | — | [r1_chg_us_094.md](sprint-8/r1_chg_us_094.md) |
| 7 | full-stack | **US-095** ⬜ | Period close blocks while unregularized movements exist (reconciliation panel) | ? ?SP | `See story file` | CHG-001 | — | — | — | [r1_chg_us_095.md](sprint-8/r1_chg_us_095.md) |
| 8 | full-stack | **US-021** ⬜ | Platform operator exports tenant data as ZIP with CSVs + PDFs + manifest | ? ?SP | `See story file` | — | US-008, US-011, US-020 | →1 | — | [r1_admin_us_021.md](sprint-8/r1_admin_us_021.md) |
| 9 | full-stack | **US-022** ⬜ | Platform operator views audit bitácora across orgs with dense filters | ? ?SP | `See story file` | — | US-008, US-021 | — | — | [r1_admin_us_022.md](sprint-8/r1_admin_us_022.md) |
| 10 | full-stack | **US-023** ⬜ | Platform operator views substrate drift status + last-check timestamp | ? ?SP | `See story file` | — | US-012, US-020 | — | — | [r1_admin_us_023.md](sprint-8/r1_admin_us_023.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 9: Sprint 9

**Stories:** 4 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-096** ⬜ | Treasurer starts an extraordinary / solidarity collection | ? ?SP | `See story file` | CHG-001 | — | — | — | [r2_chg_us_096.md](sprint-9/r2_chg_us_096.md) |
| 2 | full-stack | **US-097** ⬜ | Treasurer records a solidarity payout and closes the collection | ? ?SP | `See story file` | CHG-001 | — | — | — | [r2_chg_us_097.md](sprint-9/r2_chg_us_097.md) |
| 3 | full-stack | **US-098** ⬜ | Treasurer records a treasurer-compensation payout gated by a recognized amount | ? ?SP | `See story file` | CHG-001 | — | — | — | [r2_chg_us_098.md](sprint-9/r2_chg_us_098.md) |
| 4 | full-stack | **US-099** ⬜ | Statements, cash-flow, and public-verify reflect all movements net + collections | ? ?SP | `See story file` | CHG-001 | — | — | — | [r2_chg_us_099.md](sprint-9/r2_chg_us_099.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 10: Sprint 10

**Stories:** 8 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-100** ⬜ | BR config substrate + resolution contract (CHG-002; precedes the config-driven rules) | ? ?SP | `See story file` | — | US-008 | →4 | — | [r1_chg_us_100.md](sprint-10/r1_chg_us_100.md) |
| 2 | backend | **US-101** ⬜ | Formalize `LoanFee` + `GroupConfig.config.mora` (migration, CHG-002) | ? ?SP | `apps/web/src/app/api/` | — | US-008, US-100 | →5 | — | [r1_chg_us_101.md](sprint-10/r1_chg_us_101.md) |
| 3 | full-stack | **US-102** ⬜ | System accrues a mora fee on overdue installments (BR-17, flat_per_day) | ? ?SP | `See story file` | — | US-038, US-101 | →2 | — | [r1_misc_us_102.md](sprint-10/r1_misc_us_102.md) |
| 4 | full-stack | **US-103** ⬜ | Mora fee shown in loan detail, repayment split, and A/R aging | ? ?SP | `See story file` | — | US-102 | — | — | [r1_misc_us_103.md](sprint-10/r1_misc_us_103.md) |
| 5 | full-stack | **US-105** ⬜ | System writes the immutable year-end balance snapshot at close (CHG-003) | ? ?SP | `See story file` | — | US-046, US-101 | →9 | — | [r1_chg_us_105.md](sprint-10/r1_chg_us_105.md) |
| 6 | full-stack | **US-108** ⬜ | Period/method-freeze guard at year-end (BR-09 / BR-18) | ? ?SP | `See story file` | — | US-046, US-100 | — | — | [r1_misc_us_108.md](sprint-10/r1_misc_us_108.md) |
| 7 | full-stack | **US-104** ⬜ | Treasurer configures + waives mora (group-config + condonación, O5) | ? ?SP | `See story file` | — | US-101, US-102 | — | — | [r1_misc_us_104.md](sprint-10/r1_misc_us_104.md) |
| 8 | full-stack | **US-126** ⬜ | Treasurer records one member payment with BR-26 allocation waterfall | 5 SP | `See story file` | CHG-009 | US-029, US-036, US-040, US-100 | — | — | [r1_chg_us_126.md](sprint-10/r1_chg_us_126.md) |

### Parallel Tracks

**Backend (1 stories):** US-101
**Full-stack (6 stories):** US-100 → US-102 → US-103 → US-105 → US-108 → US-104

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 11: Sprint 11

**Stories:** 9 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-106** ⬜ | Point-in-time balance query (any date) | ? ?SP | `See story file` | — | US-105 | — | — | [r1_misc_us_106.md](sprint-11/r1_misc_us_106.md) |
| 2 | full-stack | **US-107** ⬜ | Year-end snapshot PDF (kind=year_end_snapshot) archived + verifiable | ? ?SP | `See story file` | — | US-086, US-105 | — | — | [r1_misc_us_107.md](sprint-11/r1_misc_us_107.md) |
| 3 | full-stack | **US-109** ⬜ | Seed the 2025 (+ partial 2026) historical snapshot (O6) | ? ?SP | `See story file` | — | US-105 | — | — | [r1_misc_us_109.md](sprint-11/r1_misc_us_109.md) |
| 4 | full-stack | **US-110** ⬜ | System computes the distributable surplus (BR-19, CHG-004) | ? ?SP | `See story file` | — | US-100, US-101, US-105 | →3 | — | [r1_chg_us_110.md](sprint-11/r1_chg_us_110.md) |
| 5 | full-stack | **US-114** ⬜ | Derived data: loan-activity points + distributable-surplus views (CHG-004) | ? ?SP | `See story file` | — | US-101, US-105 | →1 | — | [r1_chg_us_114.md](sprint-11/r1_chg_us_114.md) |
| 6 | full-stack | **US-115** ⬜ | Treasurer records each member's withdraw|retain disposition (CHG-005) | ? ?SP | `See story file` | — | US-053, US-091, US-092 | — | — | [r1_chg_us_115.md](sprint-11/r1_chg_us_115.md) |
| 7 | full-stack | **US-111** ⬜ | Surplus governance: Assembly sets reparto vs reserva (BR-20, CHG-004) | ? ?SP | `See story file` | — | US-110 | →2 | — | [r1_chg_us_111.md](sprint-11/r1_chg_us_111.md) |
| 8 | full-stack | **US-113** ⬜ | Exact reconciliation with ajuste line (BR-22, CHG-004) | ? ?SP | `See story file` | — | US-112 | →2 | — | [r1_chg_us_113.md](sprint-11/r1_chg_us_113.md) |
| 9 | full-stack | **US-112** ⬜ | System computes the two-pool distribution (BR-21, CHG-004) | ? ?SP | `See story file` | — | US-009, US-111, US-114 | →2 | — | [r1_chg_us_112.md](sprint-11/r1_chg_us_112.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

---

## Sprint 12: Sprint 12

**Stories:** 10 | **Points:** 0 SP

### Execution Order

| # | Track | Story | Name | Size | Where to Code | CHG | Blocked By | Blocks | Assignee | File |
|---|-------|-------|------|------|---------------|-----|------------|--------|----------|------|
| 1 | full-stack | **US-116** ⬜ | Account product-type + institution + Country/Institution reference seed (CHG-006) | ? ?SP | `See story file` | — | US-091 | →1 | — | [r1_chg_us_116.md](sprint-12/r1_chg_us_116.md) |
| 2 | full-stack | **US-118** ⬜ | BALANCE BANQUITO balance sheet + screen (CHG-007, GAP-4) | ? ?SP | `See story file` | — | US-105, US-110 | — | — | [r1_chg_us_118.md](sprint-12/r1_chg_us_118.md) |
| 3 | full-stack | **US-119** ⬜ | Year-end per-member economic summary (Saldo Económico, CHG-007) | ? ?SP | `See story file` | — | US-053, US-105 | — | — | [r1_chg_us_119.md](sprint-12/r1_chg_us_119.md) |
| 4 | full-stack | **US-120** ⬜ | Monthly group summary report (RESUMEN MENSUAL, CHG-007) | ? ?SP | `See story file` | — | US-046, US-047 | — | — | [r1_chg_us_120.md](sprint-12/r1_chg_us_120.md) |
| 5 | full-stack | **US-121** ⬜ | Identity + membership model: one treasurer manages many groups (CHG-008) | ? ?SP | `See story file` | — | US-008 | →2 | — | [r1_chg_us_121.md](sprint-12/r1_chg_us_121.md) |
| 6 | full-stack | **US-117** ⬜ | (R3+) Admin maintains Country/Institution reference data | ? ?SP | `See story file` | — | US-116 | — | — | [r3_misc_us_117.md](sprint-12/r3_misc_us_117.md) |
| 7 | full-stack | **US-122** ⬜ | Active-org session + middleware re-validation (BR-25, CHG-008) | ? ?SP | `See story file` | — | US-121 | →2 | — | [r1_chg_us_122.md](sprint-12/r1_chg_us_122.md) |
| 8 | full-stack | **US-123** ⬜ | Group-switcher chip + active-group banner in the shell (consumes IMP-229) | ? ?SP | `See story file` | — | US-122 | — | — | [r1_misc_us_123.md](sprint-12/r1_misc_us_123.md) |
| 9 | full-stack | **US-124** ⬜ | Group-picker landing (SCR-group-picker, CHG-008) | ? ?SP | `See story file` | — | US-122 | — | — | [r1_chg_us_124.md](sprint-12/r1_chg_us_124.md) |
| 10 | full-stack | **US-125** ⬜ | Onboard an additional group for an existing treasurer + switch audit (O13) | ? ?SP | `See story file` | — | US-016, US-025, US-121 | — | — | [r1_misc_us_125.md](sprint-12/r1_misc_us_125.md) |

### References

- Architecture: [docs/specs/09_architecture.md](../specs/09_architecture.md)
- Design system: [packages/design-system/tokens.json](../../packages/design-system/tokens.json)
- HTML specs: [docs/specs-html/index.html](../specs-html/index.html)

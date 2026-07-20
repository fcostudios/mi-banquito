# Change Requests — Story Cross-Reference

> **Auto-generated from nous.db.** Shows every CHG and the stories it created.
> Regenerate: `python3 Nous/System/nous_package.py sync -c sprint_plan`

| CHG | Status | Title | Stories | Sprints |
|-----|--------|-------|---------|---------|
| **CHG-001** | 📦 delivered | Treasury adjustments: fees, transfers/regularization, expenses, solidarity collection, treasurer-comp payout | US-091, US-092, US-093, US-094, US-095, US-096, US-097, US-098, US-099 | S8, S9 |
| **CHG-002** | 📦 delivered | Late/mora fee charge + formalize LoanFee entity (EOY cluster C4) | — | — |
| **CHG-003** | 📦 delivered | Year-end cut & preservation: immutable balance snapshot + point-in-time query (EOY cluster C2) | — | — |
| **CHG-004** | 📦 delivered | Surplus & two-pool reparto: surplus def + Assembly governance + two-pool distribution (EOY cluster C1) | — | — |
| **CHG-005** | 📦 delivered | Year-end distribution disposition: withdraw|retain + motive + bank link (EOY cluster C3) | — | — |
| **CHG-006** | 📦 delivered | Accounts enrichment + Country/Institution reference data (EOY cluster C6, parallel) | — | — |
| **CHG-007** | 📦 delivered | Year-end reporting: BALANCE BANQUITO balance sheet + economic summaries (EOY cluster C7) | — | — |
| **CHG-008** | 📦 delivered | Multi-group management: one treasurer manages multiple banquito groups (cluster C8) | — | — |
| **CHG-009** | 🟡 proposed | Rewrite mi-banquito sprint-0 foundation stories to the single-serverless architecture (drop Turborepo monorepo/5-package scaffold US-001; correct 29->34 entity-table count; align to dispatched Next.js/Drizzle/Auth0/Vercel stack) | — | — |
| **CHG-010** | 📦 delivered | Organization.id as per-group uuid: decouple runtime tenant key from the IMP-198 Nous substrate project key (drop org_slug/project_slug) | — | — |

---

## Detail

### CHG-001: Treasury adjustments: fees, transfers/regularization, expenses, solidarity collection, treasurer-comp payout

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-001 — Impact Analysis: Treasury adjustments / movements

**Project:** `fcostudios__mi-banquito` · **Source:** client_review (real treasurer recollection) · **Filed:** 2026-05-29
**Status:** ANALYSIS — awaiting operator scope confirmation before building (per `nous_impact_agent.md`).

## The...

**Stories created by this change:**

| Story | Name | Sprint | Status | File |
|-------|------|--------|--------|------|
| **US-091** | Treasurer sets up and manages the group's accounts | Sprint 8 | ✅ verified | [r1_chg_us_091.md](sprint-8/r1_chg_us_091.md) |
| **US-092** | Treasurer records a categorized fund movement (fee / supplies / shared expense) | Sprint 8 | ✅ verified | [r1_chg_us_092.md](sprint-8/r1_chg_us_092.md) |
| **US-093** | Treasurer records an inter-account transfer (bookkeeping) | Sprint 8 | ✅ verified | [r1_chg_us_093.md](sprint-8/r1_chg_us_093.md) |
| **US-094** | Treasurer regularizes a deposit that landed in a non-group account *(crown jewel | Sprint 8 | ✅ verified | [r1_chg_us_094.md](sprint-8/r1_chg_us_094.md) |
| **US-095** | Period close blocks while unregularized movements exist (reconciliation panel) | Sprint 8 | ✅ verified | [r1_chg_us_095.md](sprint-8/r1_chg_us_095.md) |
| **US-096** | Treasurer starts an extraordinary / solidarity collection | Sprint 9 | ⬜ backlog | [r2_chg_us_096.md](sprint-9/r2_chg_us_096.md) |
| **US-097** | Treasurer records a solidarity payout and closes the collection | Sprint 9 | ⬜ backlog | [r2_chg_us_097.md](sprint-9/r2_chg_us_097.md) |
| **US-098** | Treasurer records a treasurer-compensation payout gated by a recognized amount | Sprint 9 | ⬜ backlog | [r2_chg_us_098.md](sprint-9/r2_chg_us_098.md) |
| **US-099** | Statements, cash-flow, and public-verify reflect all movements net + collections | Sprint 9 | ⬜ backlog | [r2_chg_us_099.md](sprint-9/r2_chg_us_099.md) |

### CHG-002: Late/mora fee charge + formalize LoanFee entity (EOY cluster C4)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-002 — Late/mora fee charge + formalize the `LoanFee` entity

**Project:** `fcostudios__mi-banquito` · **EOY cluster C4** · **Release:** R1 · **Status:** proposed · **Leads the EOY dependency chain** (mora feeds the year-end surplus base). Source decisions: `GAP_ANALYSIS_eoy_2026-05-31.md` (...

_No stories linked to this change yet._

### CHG-003: Year-end cut & preservation: immutable balance snapshot + point-in-time query (EOY cluster C2)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-003 — Year-end cut & preservation (immutable balance snapshot + point-in-time query)

**Project:** `fcostudios__mi-banquito` · **EOY cluster C2** · **Release:** R1 · **Status:** proposed · **Depends on:** CHG-002 (mora in the surplus base). Source: `GAP_ANALYSIS_eoy_2026-05-31.md` (GAP-2, O...

_No stories linked to this change yet._

### CHG-004: Surplus & two-pool reparto: surplus def + Assembly governance + two-pool distribution (EOY cluster C1)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-004 — Surplus & two-pool reparto (the heart of the EOY work)

**Project:** `fcostudios__mi-banquito` · **EOY cluster C1** · **Release:** R1 · **Status:** proposed · **Depends on:** CHG-002 (mora) + CHG-003 (snapshot/CxC). Source: `GAP_ANALYSIS_eoy_2026-05-31.md` (GAP-1/3, O2/O3/O8/O9), `CHG...

_No stories linked to this change yet._

### CHG-005: Year-end distribution disposition: withdraw|retain + motive + bank link (EOY cluster C3)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-005 — Year-end distribution disposition (withdraw | retain + motive + bank link)

**Project:** `fcostudios__mi-banquito` · **EOY cluster C3** · **Release:** R1 · **Status:** proposed · **Depends on:** CHG-004 (share-out lines) + CHG-001 (multi-account). Source: `GAP_ANALYSIS_eoy_2026-05-31....

_No stories linked to this change yet._

### CHG-006: Accounts enrichment + Country/Institution reference data (EOY cluster C6, parallel)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-006 — Accounts enrichment + Country/Institution reference data

**Project:** `fcostudios__mi-banquito` · **EOY cluster C6 (parallel)** · **Release:** R1 (data model + seed); admin UI **R3+** · **Status:** proposed · **Depends on:** CHG-001 (`Account`). Source: `GAP_ANALYSIS_eoy_2026-05-31.m...

_No stories linked to this change yet._

### CHG-007: Year-end reporting: BALANCE BANQUITO balance sheet + economic summaries (EOY cluster C7)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-007 — Year-end reporting (BALANCE BANQUITO + economic summaries)

**Project:** `fcostudios__mi-banquito` · **EOY cluster C7** · **Release:** R1 (core reports; monthly summary R2) · **Status:** proposed · **Depends on:** CHG-003 (snapshot) + CHG-004 (surplus). Source: `GAP_ANALYSIS_eoy_2026-...

_No stories linked to this change yet._

### CHG-008: Multi-group management: one treasurer manages multiple banquito groups (cluster C8)

**Status:** 📦 `delivered`
**Source:** client_review
**Requested by:** Francisco
**Notes:** # CHG-008 — Multi-group management (one treasurer manages several banquitos)

**Project:** `fcostudios__mi-banquito` · **EOY cluster C8** · **Release:** R1 · **Status:** proposed · **Prerequisite:** IMP-229 (archetype header active-context control). Source: `CHG_PLAN_eoy_2026-05-31.md` PART III, ...

_No stories linked to this change yet._

### CHG-009: Rewrite mi-banquito sprint-0 foundation stories to the single-serverless architecture (drop Turborepo monorepo/5-package scaffold US-001; correct 29->34 entity-table count; align to dispatched Next.js/Drizzle/Auth0/Vercel stack)

**Status:** 🟡 `proposed`
**Source:** agent_pickup_reliability_review
**Requested by:** Francisco
**Notes:** WITHDRAWN / SUPERSEDED by IMP-265 (2026-06-06).

Path B chosen: the Turborepo monorepo is mi-banquito's AUTHORED architecture (09_architecture.md, PRIN-01/03), not stale story content. The fix is to make the serverless generator EMIT the monorepo (IMP-265), NOT to flatten the stories. Do NOT anal...

_No stories linked to this change yet._

### CHG-010: Organization.id as per-group uuid: decouple runtime tenant key from the IMP-198 Nous substrate project key (drop org_slug/project_slug)

**Status:** 📦 `delivered`
**Source:** code_review
**Requested by:** Francisco
**Notes:** # CHG-010 — Organization.id as a per-group `uuid`; decouple the runtime tenant key from the Nous substrate project key

**Project:** Mi Banquito (`fcostudios__mi-banquito`)
**Source:** code_review (org_id type defect surfaced during EOY checkup)
**Mode:** `spec_rebaseline` (operator override — se...

_No stories linked to this change yet._


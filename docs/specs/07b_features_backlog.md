# 07b — Features Backlog: Mi Banquito

**Project:** Mi Banquito (`fcostudios__mi-banquito`)
**Step:** 7b — Features Backlog (sibling of Step 7 Screens)
**Date:** 2026-05-28
**Author:** Francisco Lomas (via Nous pipeline)
**Report language:** en-US

> Authoritative feature → user-story → screen → process → bounded-context mapping for R1. Derived from `08_scope.md §SEC3` (Features Mapping) + Review Pass additions + Step 7 screen inventory.

## Summary

- **Total features in R1:** 73 from `08_scope.md §SEC3` + 17 from Review Pass + alert splits = **90 features**
- **Total user stories:** 90 (US-001..US-090)
- **Total screens:** 30 (5 admin-shell sub-tabs counted as 1 screen, `SCR-admin-org-config`)
- **Total bounded contexts touched:** 9
- **Total backstage processes referenced:** 25 (P1..P25 per `03b §2`)

## Feature → Story → Screen → Process matrix

| Feature ID | Feature | Story | Primary screen(s) | Process(es) | Context |
|---|---|---|---|---|---|
| FEAT-001 | Initialize Turborepo monorepo | US-001 | (no screen; infra) | — | (cross) |
| FEAT-002 | Provision Vercel project | US-002 | (no screen; infra) | — | (cross) |
| FEAT-003 | Provision Neon project | US-003 | (no screen; infra) | — | (cross) |
| FEAT-004 | Provision Auth0 + Organizations | US-004 | (no screen; infra) | — | (cross) |
| FEAT-005 | Provision Blob + Sentry + Better Stack | US-005 | (no screen; infra) | — | (cross) |
| FEAT-006 | Configure env vars | US-006 | (no screen; infra) | — | (cross) |
| FEAT-007 | Set up Next.js 16 route groups | US-007 | (no screen; infra) | — | (cross) |
| FEAT-008 | Drizzle initial migration | US-008 | (no screen; infra) | — | (cross) |
| FEAT-009 | Tailwind + tokens + strings + Lucide | US-009 | (no screen; infra) | — | (cross) |
| FEAT-010 | Serwist + PWA manifest | US-010 | (no screen; infra) | — | (cross) |
| FEAT-011 | Auth middleware + RLS session var | US-011 | (no screen; infra) | — | (cross) |
| FEAT-012 | Vercel Cron config | US-012 | (no screen; infra) | — | (cross) |
| FEAT-013 | CI pipeline | US-013 | (no screen; infra) | — | (cross) |
| FEAT-014 | Business-rule test infra | US-014 | (no screen; infra) | — | (cross) |
| FEAT-015 | Auth0 magic-link flow | US-015 | (no screen; infra) | — | (cross) |
| FEAT-016 | Operator creates tenant org | US-016 | SCR-admin-orgs-new, SCR-admin-org-detail | — | platform |
| FEAT-017 | Operator configures group rules (all 11 BRs) | US-017 | SCR-admin-org-config (4 tabs) | P3, P4, P5, P11, P12, P16 | platform |
| FEAT-018 | Operator invites treasurer | US-018 | SCR-admin-org-detail | — | platform |
| FEAT-019 | Per-org health snapshot | US-019 | SCR-admin-home | — | platform |
| FEAT-020 | Read-only impersonation with reason | US-020 | SCR-admin-impersonation + cross-cutting banner | — | platform |
| FEAT-021 | Data export ZIP | US-021 | SCR-admin-export | P19 | platform |
| FEAT-022 | Audit bitácora cross-org | US-022 | SCR-admin-audit | P18 | audit |
| FEAT-023 | Substrate drift status | US-023 | SCR-admin-drift | (cron) | platform |
| FEAT-024 | Business-rules panel (read-only) | US-024 | SCR-admin-business-rules | — | platform |
| FEAT-025 | First-run group setup wizard | US-025 | SCR-first-run-wizard | — | platform→ledger |
| FEAT-026 | Add a member | US-026 | SCR-add-member | P1 (indirectly via ContributionCycle bootstrap) | ledger |
| FEAT-027 | Change member status with refund | US-027 | SCR-member-detail (Acciones tab) | P2 | ledger |
| FEAT-028 | View + edit group rules (HR-1 versioned) | US-028 | SCR-group-config | (config write) | platform |
| FEAT-029 | Record contribution with slip photo | US-029 | SCR-record-contribution | P1 | ledger |
| FEAT-030 | Reverse a contribution | US-030 | (modal triggered from history/detail) | P1 reversal | ledger |
| FEAT-031 | Live compliance per member | US-031 | SCR-members-list, SCR-contributions-cycle, SCR-treasurer-home | P7 | ledger |
| FEAT-032 | Record annual base-fund quota | US-032 | SCR-record-base-fund-quota | P24 | ledger |
| FEAT-033 | Originate member loan declining-balance | US-033 | SCR-originate-loan | P3, P4, P10, P21 | loan |
| FEAT-034 | Originate non-member loan with guarantor | US-034 | SCR-originate-loan (non-member branch) | P3, P4, P10, P21 | loan |
| FEAT-035 | Designate referrer on origination | US-035 | SCR-originate-loan (optional field) | (recorded for P22) | loan |
| FEAT-036 | Record loan repayment with auto-split | US-036 | SCR-record-repayment | P6 | loan + ledger |
| FEAT-037 | Loan detail with all sub-views | US-037 | SCR-loan-detail | P3, P4, P5, P6, P21 | loan |
| FEAT-038 | Daily interest accrual cron | US-038 | (no screen; cron) | P5 | interest |
| FEAT-039 | Referral commission on payoff | US-039 | (no screen; post-commit) | P22 | loan |
| FEAT-040 | A/R aging primary view | US-040 | SCR-ar-aging | P8 | ledger |
| FEAT-041 | Mark promise on a late row | US-041 | SCR-ar-aging (modal) | P17 (kind promise_marked) | alerts |
| FEAT-042 | Share chase message via WhatsApp | US-042 | SCR-ar-aging (share-intent) | — | (cross) |
| FEAT-043 | Promise reminder on due date | US-043 | (no screen; cron + Alert) | P17 | alerts |
| FEAT-044 | Enter declared bank balance + see discrepancy | US-044 | SCR-monthly-close | P12 | reconciliation |
| FEAT-045 | Annotate discrepancy with reason | US-045 | SCR-monthly-close | P12 | reconciliation |
| FEAT-046 | Lock monthly close | US-046 | SCR-monthly-close | P13 | reconciliation |
| FEAT-047 | Generate monthly close PDF | US-047 | (post-commit; preview on SCR-statements-archive) | P14 | reporting |
| FEAT-048 | Generate per-member statements | US-048 | SCR-statements-archive | P15 | reporting |
| FEAT-049 | Share statement via WhatsApp | US-049 | SCR-statements-archive (share-intent) | — | (cross) |
| FEAT-050 | Treasurer compensation cron | US-050 | (no screen; cron) | P23 | reporting + platform |
| FEAT-051 | Year-end share-out wizard time-weighted | US-051 | SCR-year-end-share-out | P25 | reporting + liquidity |
| FEAT-052 | Per-member share override with reason | US-052 | SCR-year-end-share-out | P25 | reporting |
| FEAT-053 | Approve year-end share-out | US-053 | SCR-year-end-share-out | P25, P14, P15, P2 | reporting |
| FEAT-054 | Liquidez Proyectada single screen | US-054 | SCR-cash-flow-projection | P9, P11 | liquidity |
| FEAT-055 | Alerts bell + dismiss/snooze/Avisar | US-055 | (header organism, cross-cutting) | P17 | alerts |
| FEAT-056 | Historial as plain-Spanish narration | US-056 | SCR-history | P18 | audit |
| FEAT-057 | Search Historial by filters | US-057 | SCR-history | P18 | audit |
| FEAT-058 | Member balance lookup from home | US-058 | SCR-treasurer-home (member-picker) | P7 | ledger |
| FEAT-059 | Member receives statement via WhatsApp | US-059 | (artifact only) | — | reporting |
| FEAT-060 | President receives close PDF via WhatsApp | US-060 | (artifact only) | — | reporting |
| FEAT-061 | Emit A1 conciliación pendiente | US-061 | (bell; cron) | P17 | alerts |
| FEAT-062 | Emit A2 préstamo próximo a vencer | US-062 | (bell) | P17 | alerts |
| FEAT-063 | Emit A3 aporte atrasado | US-063 | (bell) | P17 | alerts |
| FEAT-064 | Emit A4 liquidez bajo margen | US-064 | (bell) | P17 | alerts |
| FEAT-065 | Emit A5 reparto excede proyección | US-065 | (bell) | P17 | alerts |
| FEAT-066 | Emit A6 préstamo en mora | US-066 | (bell) | P17 | alerts |
| FEAT-067 | Emit A7 discrepancia bancaria | US-067 | SCR-monthly-close + bell | P17 | alerts + reconciliation |
| FEAT-068 | Emit A14 saldo negativo | US-068 | (bell) | P17 | alerts |
| FEAT-069 | Append-only ledger triggers | US-069 | (no screen; DB layer) | (DB triggers) | ledger |
| FEAT-070 | Period-lock immutability trigger | US-070 | (no screen; DB layer) | (DB triggers) | reconciliation |
| FEAT-071 | Audit-write-failure rollback pattern | US-071 | (cross-cutting AC) | P18 | audit |
| FEAT-072 | Cross-tenant safety via RLS | US-072 | (no screen; DB layer) | (RLS policies) | (cross) |
| FEAT-073 | Sentry PII redaction | US-073 | (no screen; SDK) | — | (cross) |
| FEAT-074 (NEW) | Cash / bank / petty cash payment source | US-074 | SCR-record-contribution + SCR-monthly-close + SCR-originate-loan | P1, P12 | ledger + reconciliation |
| FEAT-075 (NEW) | Partial aporte state | US-075 | SCR-contributions-cycle + SCR-members-list | P1, P7 | ledger |
| FEAT-076 (NEW) | Loan disbursement source | US-076 | SCR-originate-loan | P3 | loan |
| FEAT-077 (NEW) | PWA offline-write visible state | US-077 | SCR-record-contribution + all write screens | — | (cross) |
| FEAT-078 (NEW) | Promise tracking with reminder | US-078 | SCR-ar-aging | P17 | alerts |
| FEAT-079 (NEW) | FcoStudios platform-org bootstrap | US-079 | (no screen; seed script) | — | platform |
| FEAT-080 (NEW) | Freeze / archive tenant org | US-080 | SCR-admin-org-detail | P19 (audit) | platform |
| FEAT-081 (NEW) | Cron run history + replay | US-081 | SCR-admin-cron-runs | (operational) | platform |
| FEAT-082 (NEW) | Operator re-issues magic link | US-082 | SCR-admin-org-detail | — | platform |
| FEAT-083 (NEW) | Operator opens adjustment period | US-083 | SCR-admin-org-detail / SCR-admin-cron-runs | P13 (variant) | reconciliation |
| FEAT-084 (NEW) | Reverse approved year-end share-out (24h grace) | US-084 | SCR-year-end-share-out | P25 reversal | reporting |
| FEAT-085 (NEW) | Public PDF verifier endpoint | US-085 | SCR-public-verify-pdf | — | reporting |
| FEAT-086 (NEW) | PDFs explain content richly | US-086 | SCR-statements-archive + SCR-year-end-share-out (PDF templates) | P14, P15 | reporting |
| FEAT-087 (NEW) | Design-partner onboarding ceremony | US-087 | SCR-admin-pilot-log | — | platform |
| FEAT-088 (NEW) | Emit A8 período no cerrado N días | US-088 | (bell + admin home) | P17 | alerts |
| FEAT-089 (NEW) | Emit A9 cambio config grupo | US-089 | (bell) | P17 | alerts |
| FEAT-090 (NEW) | Emit A11 aporte sin foto N consecutivos | US-090 | (bell) | P17 | alerts |

## Feature count by epic

| Epic | Feature count |
|---|---|
| Epic 0 — Base scaffolding | 15 |
| Epic 1 — Platform lifecycle | 9 |
| Epic 2 — Treasurer onboarding | 4 |
| Epic 3 — Contribution cycle | 5 |
| Epic 4 — Loan lifecycle | 7 |
| Epic 5 — Collections + liquidity | 5 |
| Epic 6 — Reconciliation + monthly close | 5 |
| Epic 7 — Statement distribution | 5 |
| Epic 8 — Year-end share-out | 3 |
| Epic 9 — Alerts (split per F2) | 11 |
| Epic 10 — Historial + audit | 2 |
| Epic 11 — Substrate enforcement | 5 |
| Epic 14 — Money-flow realism + trust artifacts + operator recovery | 14 |
| **Total** | **90** |

## Coverage matrix — bounded contexts

| Context | Features owning at least one story |
|---|---|
| `platform_context` | FEAT-016..024, FEAT-050, FEAT-079..082, FEAT-087 |
| `ledger_context` | FEAT-026..032, FEAT-058, FEAT-069, FEAT-074, FEAT-075 |
| `loan_context` | FEAT-033..039, FEAT-076 |
| `interest_context` | FEAT-038 |
| `reconciliation_context` | FEAT-044..047, FEAT-067, FEAT-070, FEAT-083 |
| `reporting_context` | FEAT-048, FEAT-049, FEAT-051..053, FEAT-084..086 |
| `liquidity_context` | FEAT-054 |
| `alerts_context` | FEAT-041, FEAT-043, FEAT-055, FEAT-061..068, FEAT-078, FEAT-088..090 |
| `audit_context` | FEAT-022, FEAT-056, FEAT-057, FEAT-071, FEAT-072 |

All 9 bounded contexts have explicit feature coverage. No context is orphaned.

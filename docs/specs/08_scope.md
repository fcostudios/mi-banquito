---SECTION: SEC0---
Scope Executive Summary

Mi Banquito is a multi-tenant SaaS treasury system for informal community savings and lending groups ("banquitos") in Ecuador (R1), with later LATAM expansion. The R1 product is delivered as a single Next.js 16 PWA on Vercel, backed by Neon Postgres with Auth0 identity, and consists of two surfaces from the same codebase: a treasurer console (Spanish-first, vocabulary-locked, large-default-typography) and a thin platform admin slice (CLI-grade, expert-tool register). The R1 release supports one design-partner organization (the founder's mother's banquito) and proves the multi-tenant substrate is ready for additional onboardings without a migration.

The scope below decomposes the build into 13 epics and 73 user stories covering (i) base scaffolding and infra provisioning, (ii) tenant lifecycle and group setup, (iii) the six tenant journey stages, (iv) the 11 business rules from `09b_business_rules.md`, (v) the cross-cutting backstage processes from `03b_service_blueprint.md`, and (vi) the platform admin surface. Every story carries acceptance criteria, prerequisites, information-required, a journey/process trace, target screens, and an explicit gap callout where the story introduces work not previously documented in the R1 plan.

Critical In-Scope Capabilities for R1: append-only ledger with reversal-only corrections; declining-balance loan engine with member/non-member rate bands and 1 % first-installment admin fee; non-member loans backed by member guarantor; referral commissions on loan payoff; treasurer compensation (fixed monthly or yearly); annual per-member base-fund quota with derived available-capital projection; time-weighted year-end share-out with treasurer-overridable per-member breakdown; per-fiscal-year reporting; PWA installable on Android and iOS with offline-tolerant reads; thin admin slice for organization lifecycle, read-only impersonation, one-button data export, and substrate drift surfacing.
---END-SECTION: SEC0---

---SECTION: SEC1---
Context, Problem and Drivers

Context. Informal community savings groups across LATAM run their treasury on paper, Excel, and WhatsApp. The treasurer is a non-technical mid-life adult who carries personal reputational risk for every cent of the group's money. The product sits in the whitespace below SEPS-registered cooperatives and above consumer expense-splitting apps — there is no incumbent at this tier. The first design partner is the founder's mother's banquito in Ecuador.

Core Problems and Pain Points. Arithmetic errors compound in paper + Excel; the bank-vs-books reconciliation is rarely performed; WhatsApp deposit slips are lost in chat scrolls; the treasurer has no live A/R aging; loan-rate logic is recomputed by hand per loan; the year-end share-out is the highest-stakes calculation and the most-disputable artifact; treasurer compensation, referral commissions, and base-fund quotas are tracked informally and forgotten. A single accusation of mishandling money can collapse a banquito built over years.

Drivers for Change. Smartphones and PWAs are universal in the target population; WhatsApp is the de-facto channel; no existing product targets this tier; the Nous pipeline is mature enough to deliver a real product end-to-end; the founder has a personal commitment to the design partner.

AS-IS Process Snapshot. The treasurer maintains a paper notebook as the chronological ledger and an Excel sheet as the per-member balance view. Members transfer contributions to the group's bank account and send a slip photo via WhatsApp; the treasurer transcribes the entry to paper, later to Excel. Loans are written on paper with interest computed by hand; repayments are recorded similarly. Monthly close is a Sunday-killing exercise that is often skipped formally. Year-end share-out is computed manually with high dispute risk. WhatsApp is the channel for everything member-facing.
---END-SECTION: SEC1---

---SECTION: SEC2---
Objectives and Success Metrics

Objectives. (1) Ship the pilot version to the first design partner in 4-6 months. (2) Reduce monthly-close time from several hours to under 30 minutes within 1 month of go-live. (3) Achieve zero ledger-vs-bank discrepancy at month-end for 3 consecutive months by month 3 post-launch. (4) Validate the multi-tenant substrate by demonstrating a sub-1-day onboarding of a hypothetical second tenant. (5) Establish business-rule discipline that supports R2 expansion to other LATAM banquitos.

Success Metrics. Monthly-close time (target < 30 min); reconciliation accuracy (target 100 % zero-discrepancy months by month 3); statement-dispute rate (target 0); treasurer self-report "would not go back to paper" (target yes by month 2); time-to-onboard-second-org (target < 1 day); drift-check pass rate at release (target 100 %); R1 hosting cost (target < $30/month).

Metric Horizon. Operationally measured from go-live (target 2026-10-28) through month 6 post-launch (2027-04). Treasurer self-report measured monthly; reconciliation accuracy measured per close event; substrate KPIs measured per release.
---END-SECTION: SEC2---

---SECTION: SEC3---
In-Scope Capabilities

Scope Statement. R1 ships the treasurer console + thin admin slice, hosting the founder's mother's banquito as the design partner, with the data model + RLS-enforced multi-tenant substrate ready for additional onboardings. The product is positioned as closed-group internal record-keeping; no consumer-lending or deposit-taking framing.

Capabilities by Domain/Module.
- Base scaffolding and infra provisioning (cross-cutting): Turborepo monorepo, Vercel project, Neon database, Auth0 tenant with Organizations, Vercel Blob, Sentry, Better Stack, environment variables across local/preview/prod, CI pipeline, design-system codegen, PWA manifest + service worker, Auth0 magic-link flow, business-rule test infrastructure.
- Platform context (admin): organization create + configure + freeze + archive, treasurer invite, per-org health snapshot, read-only impersonation, one-button data export, audit log surface, drift status, business-rules panel.
- Ledger context (treasurer + system): member registry, contribution cycle creation, contribution recording with slip photo and reversal pattern, withdrawal, expense, base-fund quota payment, derived A/R aging + compliance.
- Loan context: loan origination with member/non-member borrower flow and guarantor for non-member, declining-balance schedule generation, admin fee on installment 1, loan eligibility pre-flight, repayment recording with auto-split, referral commission accrual on payoff.
- Interest context: daily/per-period interest accrual cron, replay-safe.
- Reconciliation context: bank balance reconciliation with discrepancy resolution, period-lock immutability.
- Reporting context: monthly close PDF, per-member statement PDF with canonical-hash integrity, year-end share-out wizard with time-weighted breakdown by source and treasurer override.
- Liquidity context: cash-flow projection, year-end commitment evaluation, available-capital derivation (pool minus base fund).
- Alerts context: emission of 14 alert kinds with dedup and dismiss/snooze.
- Audit context: per-write audit log with same-transaction guarantee.

Features Mapping.

| Feature ID | Feature Name | Domain / Module | Related Personas | Related Journeys | Notes |
|---|---|---|---|---|---|
| FEAT-001 | Initialize Turborepo monorepo with apps/web and 5 packages | Infra | Operator | PA-S0 | New foundation story |
| FEAT-002 | Provision Vercel project with custom domain and preview deploys | Infra | Operator | PA-S0 | New |
| FEAT-003 | Provision Neon project with branching per Vercel preview | Infra | Operator | PA-S0 | New |
| FEAT-004 | Provision Auth0 tenant with Organizations and FcoStudios org | Infra | Operator | PA-S0 | New; OQ-ARCH-2 verification gate |
| FEAT-005 | Provision Vercel Blob store and Sentry project and Better Stack monitor | Infra | Operator | PA-S0 | New |
| FEAT-006 | Configure environment variables for local preview and prod | Infra | Operator | PA-S0 | New |
| FEAT-007 | Set up Next.js 16 App Router with treasurer and admin route groups | Infra | Operator | PA-S0 | New |
| FEAT-008 | Set up Drizzle initial migration with 29 entity tables RLS triggers materialized views | Infra | Operator | PA-S0 | New; includes 09b additions |
| FEAT-009 | Set up Tailwind 4 with design tokens and strings.es-EC.json and Lucide allow-list | Infra | Operator | PA-S0 | New |
| FEAT-010 | Set up Serwist service worker and PWA manifest installable Android and iOS | Infra | Operator + Treasurer | PA-S0 | New |
| FEAT-011 | Set up auth middleware Auth0 session extraction and Postgres RLS session var | Infra | Operator | PA-S0 | New |
| FEAT-012 | Set up Vercel Cron config for daily interest and treasurer compensation and drift sweep | Infra | Operator | PA-S0 | New |
| FEAT-013 | Set up CI pipeline type-check lint test Drizzle migration check axe a11y | Infra | Operator | PA-S0 | New |
| FEAT-014 | Set up business-rule test infrastructure golden files property-based | Infra | Operator | PA-S0 | New per 09b |
| FEAT-015 | Set up Auth0 magic-link passwordless email flow | Infra | Operator + Treasurer | PA-S0 | New |
| FEAT-016 | Platform operator creates a new tenant organization | Platform | Operator | PA-S1 | |
| FEAT-017 | Platform operator configures group rules including 11 business rules | Platform | Operator | PA-S2 | Per 09b BR-01 to BR-11 |
| FEAT-018 | Platform operator invites the treasurer via Auth0 organization invite | Platform | Operator | PA-S3 | |
| FEAT-019 | Platform operator views per-org health snapshot on admin home | Platform | Operator | PA-S4 | |
| FEAT-020 | Platform operator starts read-only impersonation with required reason | Platform | Operator | PA-S5 | |
| FEAT-021 | Platform operator exports tenant data as ZIP with CSVs PDFs manifest | Platform | Operator | PA-S6 | |
| FEAT-022 | Platform operator views audit bitacora across orgs with dense filters | Platform | Operator | PA-S6 | |
| FEAT-023 | Platform operator views substrate drift status and last-check timestamp | Platform | Operator | PA-S7 | |
| FEAT-024 | Platform operator views per-org business-rules panel | Platform | Operator | (new) | New per 09b BR catalogue |
| FEAT-025 | Treasurer first-run group setup wizard 3 screens | Tenant onboarding | Treasurer | S1 | |
| FEAT-026 | Treasurer adds a member with name WhatsApp number role initial savings | Tenant ledger | Treasurer | S1 | |
| FEAT-027 | Treasurer changes a member status to en pausa or baja with refund A/P entry | Tenant ledger | Treasurer | S1 | |
| FEAT-028 | Treasurer views and edits group rules read-only first then edits with HR-1 versioning | Tenant config | Treasurer | S1 | |
| FEAT-029 | Treasurer records a contribution with slip photo and optional notes | Tenant ledger | Treasurer | S2 | |
| FEAT-030 | Treasurer reverses a prior contribution with required reason | Tenant ledger | Treasurer | S2 | Reversal pattern |
| FEAT-031 | Treasurer views live compliance state per member with green amber red encoding | Tenant ledger | Treasurer | S2 | |
| FEAT-032 | Treasurer records the annual base fund quota payment for a member | Tenant ledger | Treasurer | S2 | New per 09b BR-08 OQ-BR8-1 option a |
| FEAT-033 | Treasurer originates a member loan declining-balance schedule auto-generated | Tenant loans | Treasurer | S3 | Per BR-01 BR-02 BR-03 BR-04 |
| FEAT-034 | Treasurer originates a non-member loan with required guarantor picker | Tenant loans | Treasurer | S3 | New per BR-05 |
| FEAT-035 | Treasurer optionally designates a referrer member on origination | Tenant loans | Treasurer | S3 | New per BR-06 |
| FEAT-036 | Treasurer records a loan repayment with auto split interest first | Tenant loans | Treasurer | S3 | |
| FEAT-037 | Treasurer views loan detail with schedule fees repayments accruals referrer guarantor | Tenant loans | Treasurer | S3 | Includes new tabs for fees + referral |
| FEAT-038 | System fires daily interest accrual cron idempotent on loan_id and accrued_on | Backstage interest | (system) | S3 cron | |
| FEAT-039 | System fires referral commission credit on Loan status pagado | Backstage loans | (system) | S3 | New per BR-06 |
| FEAT-040 | Treasurer views the A R aging primary tab sorted by days late descending | Tenant collections | Treasurer | S4 | |
| FEAT-041 | Treasurer marks a promise on a late row with a date | Tenant collections | Treasurer | S4 | |
| FEAT-042 | Treasurer shares a chase message via WhatsApp from a late row | Tenant collections | Treasurer | S4 | |
| FEAT-043 | System surfaces promise on the promised date as a reminder | Backstage alerts | (system) | S4 | |
| FEAT-044 | Treasurer enters declared bank balance and sees discrepancy in cierre flow | Tenant reconciliation | Treasurer | S5 | |
| FEAT-045 | Treasurer annotates a discrepancy outside tolerance with required reason | Tenant reconciliation | Treasurer | S5 | |
| FEAT-046 | Treasurer locks the monthly close and the period becomes immutable | Tenant reconciliation | Treasurer | S5 | |
| FEAT-047 | System generates the monthly close PDF with canonical-JSON SHA-256 hash | Backstage reporting | (system) | S5 | |
| FEAT-048 | Treasurer generates per-member statements as a batch and individually | Tenant reporting | Treasurer | S6 | |
| FEAT-049 | Treasurer shares a statement via WhatsApp share intent | Tenant reporting | Treasurer | S6 | |
| FEAT-050 | System awards treasurer compensation per cron with idempotency | Backstage reporting | (system) | (cron) | New per 09b BR-07 |
| FEAT-051 | Treasurer opens year-end share-out wizard with time-weighted breakdown by source | Tenant reporting | Treasurer | S6 annual | New per 09b BR-09 BR-11 |
| FEAT-052 | Treasurer overrides a per-member share with required reason and audit | Tenant reporting | Treasurer | S6 annual | Per BR-11 |
| FEAT-053 | Treasurer approves year-end share-out which writes payouts and PDFs | Tenant reporting | Treasurer | S6 annual | |
| FEAT-054 | Treasurer views Liquidez Proyectada single screen with sandbox | Tenant liquidity | Treasurer | S4 | Per 03b cash-flow projection |
| FEAT-055 | Treasurer views and acts on the alerts bell with dismiss snooze and Avisar | Tenant alerts | Treasurer | (cross) | |
| FEAT-056 | Treasurer views Historial as plain-Spanish audit narration | Tenant audit | Treasurer | (cross) | |
| FEAT-057 | Treasurer searches Historial by member kind and date range | Tenant audit | Treasurer | (cross) | |
| FEAT-058 | Treasurer views balance for any member via partial-name search on home | Tenant ledger | Treasurer | S6 | |
| FEAT-059 | Member receives statement via WhatsApp from treasurer | (artifact only) | Member | S6 | No app login R1 |
| FEAT-060 | President receives monthly close PDF via WhatsApp from treasurer | (artifact only) | President | S5 S6 | No app login R1 |
| FEAT-061 | System emits A1 conciliacion pendiente alert | Backstage alerts | (system) | (cross) | |
| FEAT-062 | System emits A2 prestamo proximo a vencer alert | Backstage alerts | (system) | (cross) | |
| FEAT-063 | System emits A3 aporte atrasado alert | Backstage alerts | (system) | (cross) | |
| FEAT-064 | System emits A4 liquidez bajo margen alert | Backstage alerts | (system) | (cross) | Per 03b |
| FEAT-065 | System emits A5 compromiso reparto excede proyeccion alert | Backstage alerts | (system) | (cross) | Per 03b |
| FEAT-066 | System emits A6 prestamo en mora alert | Backstage alerts | (system) | (cross) | |
| FEAT-067 | System emits A7 discrepancia bancaria detectada alert | Backstage alerts | (system) | S5 | |
| FEAT-068 | System emits A14 saldo de miembro negativo alert | Backstage alerts | (system) | (cross) | |
| FEAT-069 | System enforces append-only ledger via Postgres row triggers | Substrate | (system) | (cross) | NFR-SEC-02 |
| FEAT-070 | System enforces period-lock immutability via Postgres row trigger | Substrate | (system) | (cross) | NFR-SEC-03 |
| FEAT-071 | System enforces audit-write-failure rollback via same-transaction pattern | Substrate | (system) | (cross) | NFR-SEC-04 |
| FEAT-072 | System enforces cross-tenant safety via Postgres RLS plus auth session var | Substrate | (system) | (cross) | NFR-SEC-01 |
| FEAT-073 | System captures errors with PII redaction in Sentry | Observability | (system) | (cross) | NFR-OBS-01 |

Partial Scope Notes. FEAT-024 (business-rules panel) and FEAT-032 (base-fund quota flow) and FEAT-034 (non-member loan with guarantor) and FEAT-035 (referrer designation) and FEAT-050 (treasurer compensation cron) and FEAT-051..053 (time-weighted share-out wizard) are NEW additions surfaced by `09b_business_rules.md` and were NOT in the 23-screen list from `06_design_system.md`. Step 7 (Screens) must add these surfaces. The Loan detail view in FEAT-037 requires an extended `organism.loan-card` with fees, accruals, referrer, and guarantor sub-views — also new.
---END-SECTION: SEC3---

---SECTION: SEC4---
Out-of-Scope and Exclusions

Explicitly Out of Scope (R1).
- Member-side PWA login with self-service balance lookup. Members receive PDF statements via WhatsApp from the treasurer; deferred to R2.
- WhatsApp Business API integration for automated receipts and reminders. The treasurer uses share-intents to forward content manually. Deferred to R2.
- OCR on deposit slip photos. The amount is entered manually; the photo is stored as evidence. Deferred to R2.
- Multi-currency per organization. The architecture supports it; only USD is exposed in R1. Multi-currency exposed in R3.
- SMS notifications. WhatsApp covers communication; SMS would duplicate.
- Bank API or open-banking statement import. Bank balance is manually entered in reconciliation. Deferred to R3.
- KYC, AML, tax reporting, or any regulatory compliance flow. The R1 framing is closed-group internal record-keeping.
- Native iOS or Android applications. R1 ships PWA only.
- Multi-operator platform roles. Single super-user (Francisco) in R1; multi-role admin in R2.
- BI dashboard or cross-tenant analytics. Per-org snapshot suffices for R1.
- Anti-fraud rule engine. R3.
- Compound or simple-with-fee interest rate models. Only `flat_per_period` (legacy) and `declining_balance` (R1 default) are shipped.
- Member self-onboarding to take a loan. Loan origination is treasurer-initiated.
- In-app voting or loan-approval workflow. Approval remains a social act in WhatsApp or at the meeting.
- ~~Late-fee automation.~~ **Moved INTO R1 (CHG-002, BR-17):** automatic **mora fee on overdue loan installments** (per-group `GroupConfig.config.mora`; Mi Banquito = `flat_per_day` $0.25/day, cap `overdue_installment`). Still out of scope: late fees on **savings contributions** (`config.mora.scope = loans` default; `loans_and_savings` is configurable later).
- Automatic guarantor debit on non-member default. Per OQ-BR5-1, R1 surfaces an alert only; treasurer takes manual action.
- Encryption-at-rest of member WhatsApp numbers. R1 stores plain; R3 candidate for `pgcrypto`.

Assumed Out of Scope. Email delivery beyond Auth0 magic-link transactional emails. In-product chat. Member-side push notifications. Document-management beyond the slip photo + PDF artifact. Analytics tooling like Mixpanel or PostHog. A dedicated payment-gateway integration (the group's bank account remains external).
---END-SECTION: SEC4---

---SECTION: SEC5---
Personas, Actors and Journeys Coverage

Key Personas and Actors. La Tesorera (P01, primary active user), El Presidente (P02, monthly read via WhatsApp PDF), El Miembro / La Miembra (P03, monthly statement receipt via WhatsApp PDF; never logs in in R1), La Operadora de la Plataforma (P04, FcoStudios SaaS-layer admin). System actors per `03b §1`: SYS_Ledger, SYS_LoanEngine, SYS_InterestEngine, SYS_ReconciliationEngine, SYS_CashFlowProjector, SYS_AlertEngine, SYS_PdfGenerator, SYS_ShareOutEngine, SYS_AuditLog, SYS_ComplianceDerivedView, SYS_PlatformOps.

Persona Coverage. P01 La Tesorera is the focus of FEAT-025 through FEAT-058 plus FEAT-018 (invited by operator) plus FEAT-024 (read-only by operator on her behalf). P02 El Presidente is covered by FEAT-060 (artifact receipt only). P03 El Miembro is covered by FEAT-059 (artifact receipt only). P04 La Operadora is the focus of FEAT-001 through FEAT-024 (infra plus admin slice).

Journey Coverage Summary.

| Journey | Personas | In Scope? (Yes/Partial/No) | Notes |
|---|---|---|---|
| PA-S0 Base scaffolding and infra provisioning | Operator | Yes | New epic at the front; FEAT-001 through FEAT-015 |
| PA-S1 Create new tenant org | Operator | Yes | FEAT-016 |
| PA-S2 Configure tenant org | Operator | Yes | FEAT-017 + FEAT-024 |
| PA-S3 Invite treasurer | Operator | Yes | FEAT-018 |
| PA-S4 Observe per-org health | Operator | Yes | FEAT-019 |
| PA-S5 Support via read-only impersonation | Operator | Yes | FEAT-020 |
| PA-S6 Data export | Operator | Yes | FEAT-021 + FEAT-022 |
| PA-S7 Substrate bug surfaced as IMP | Operator | Yes | FEAT-023 |
| S1 Group setup + member admin | Treasurer | Yes | FEAT-025 to FEAT-028 |
| S2 Contribution cycle | Treasurer | Yes | FEAT-029 to FEAT-032 + FEAT-058 |
| S3 Loan lifecycle | Treasurer | Yes | FEAT-033 to FEAT-039 |
| S4 Collections + liquidity | Treasurer | Yes | FEAT-040 to FEAT-043 + FEAT-054 |
| S5 Reconciliation + monthly close | Treasurer | Yes | FEAT-044 to FEAT-047 + FEAT-067 |
| S6 Statement distribution + year-end | Treasurer | Yes | FEAT-048 to FEAT-053 + FEAT-050 |
| President monthly review | President | Yes (artifact only) | FEAT-060 |
| Member statement receipt | Member | Yes (artifact only) | FEAT-059 |

Coverage Gaps. None of the four documented personas have an uncovered journey stage in R1. Open verification gaps surfaced for design-partner walkthrough: (a) the base-fund quota payment UX (FEAT-032) — the *separate transaction* flow is new and unprototyped; (b) the non-member loan origination with guarantor picker (FEAT-034) — new variant of the loan-origination screen; (c) the time-weighted year-end share-out wizard with by-source breakdown (FEAT-051) — significantly more complex than the original spec.
---END-SECTION: SEC5---

---SECTION: SEC6---
Functional Architecture and Modules (AS-IS vs TO-BE)

AS-IS Functional Landscape. Paper notebook (canonical ledger), Excel (per-member balance, second ledger that drifts), WhatsApp (communication + deposit slips lost in scroll), bank app (group pool balance, never reconciled), mental math (interest accrual + share-out + reconciliation), in-person meetings (governance + dispute escalation), no archive (statements are verbal or paper photos).

TO-BE Functional Architecture. Single Next.js 16 application with two route groups (`app/(treasurer)/*` and `app/(admin)/*`) backed by Drizzle ORM on Neon Postgres with PostgreSQL Row-Level Security enforcing multi-tenancy. Domain logic in `packages/domain` parameterized by `GroupConfig` per Pattern C from `09b §1`. Vercel Cron Jobs drive scheduled work. Server Actions for writes; React Server Components for reads. `@react-pdf/renderer` for server-side PDF generation with canonical-JSON SHA-256 hash. Serwist for PWA service worker. Auth0 with Organizations for multi-tenant identity. Vercel Blob for slip photos and PDF artifacts. Sentry for error monitoring with PII redaction.

AS-IS vs TO-BE Capability Comparison.

| Capability | AS-IS | TO-BE | Expected Improvement |
|---|---|---|---|
| Ledger primacy | Paper + Excel coexist | Single canonical electronic ledger | Errors eliminated; auditable |
| Mutability | Destructive edits | Append-only with reversal pattern | Trust-by-immutability |
| Reconciliation cadence | Rare or never | Monthly with first-class workflow | Habit forced; zero discrepancy by month 3 target |
| Interest accrual | Manual per loan per month | Cron-driven declining-balance per loan | Math errors eliminated |
| A R aging | Memory of treasurer | Live derived view sorted by days late | Data-driven chase decisions |
| Per-member statement | Verbal or paper photo | PDF with cryptographic hash via WhatsApp share | Trust artifact for members and president |
| Year-end share-out | Manual hand-math | Time-weighted with by-source breakdown, treasurer-overridable | Defensible by export; per-member rationale visible |
| Loan eligibility | Treasurer guess | Pre-flight checks for pool capacity, base fund, member cap, guarantor | Errors explained pre-write |
| Audit trail | None | Per-write audit log with same-tx guarantee | Dispute-resolution baseline |
| Alerts | None | 14 alert kinds with dedup, dismiss, snooze | Proactive risk surfacing |
| Business rules | Informal, varies per loan | 11 rules locked in code + GroupConfig stamped per loan | Replayable; per-org customization |
| Onboarding | Operator manual | Admin slice org-create + Auth0 invite | < 1 day per new tenant |
| Multi-tenant safety | n/a | Postgres RLS + Auth0 session var | No cross-org leak under any code path |
| Data ownership | Paper at treasurer's home | Vercel Blob + per-org export | One-button ZIP of CSVs and PDFs |
---END-SECTION: SEC6---

---SECTION: SEC7---
Integrations, Interfaces and Data Flows

Systems to Integrate. Auth0 (identity, Organizations, passwordless magic link); Neon (Postgres SoR); Vercel Blob (object store for slip photos and PDF artifacts); Vercel Cron Jobs (scheduled execution); Sentry (error monitoring); Better Stack (uptime monitoring); WhatsApp (consumer-mediated artifact distribution via OS share intent; no API integration in R1).

Integration Details. Auth0 SDK middleware extracts the `org_id` claim from the session and sets the PostgreSQL session variable `app.current_org`; RLS policies on every tenant table enforce `org_id = current_setting('app.current_org', true)`. Drizzle ORM connects to Neon via the HTTP driver in the Edge runtime for reads, and via the WebSocket driver in the Node runtime for cron jobs. Vercel Cron triggers Route Handlers under `/api/cron/*` with shared bearer secret. PDF generation calls `@react-pdf/renderer` server-side; the generated PDF is uploaded to Vercel Blob and a `StatementArchive` row records the URI plus the SHA-256 of the canonical-JSON payload (not of PDF bytes — font-rendering safe). Sentry captures errors with a PII redaction layer that masks WhatsApp numbers and member names.

Key Data Entities in Motion. Contribution, Withdrawal, Repayment, Expense, InterestAccrual (ledger writes); SlipPhoto (object store); Loan + LoanSchedule (loan-engine outputs); LoanFee + LoanReferral + LoanGuarantor (new per 09b); ReconciliationCycle + PeriodClose; StatementArchive (with canonical-JSON hash); BaseFundQuotaConfig + BaseFundQuotaPayment (new per 09b BR-08); TreasurerCompensationDisbursement (new per 09b BR-07); Alert; AuditLogEntry; EntityVersion.

Integration Constraints. The treasurer device is a low-end Android smartphone on intermittent 3G; the integration architecture must remain functional under these conditions. Writes are queued via service worker with `client_request_id` UNIQUE for idempotent retries. Reads use stale-while-revalidate cache strategy. No always-online dependency in R1 for any tenant action; the platform admin slice is laptop-first and can assume connectivity.
---END-SECTION: SEC7---

---SECTION: SEC8---
Non-Functional Requirements (NFRs)

Explicit NFRs from Inputs. NFR-PERF-01 treasurer Server Action P95 < 500 ms; NFR-PERF-02 home TTFB < 800 ms over 3G; NFR-PERF-03 PDF P95 < 2 s; NFR-AVAIL-01 99.5 % monthly availability; NFR-DURAB-01 RPO 24 h RTO 1 h; NFR-SEC-01 no cross-tenant leak; NFR-SEC-02 append-only ledger; NFR-SEC-03 period-lock immutability; NFR-SEC-04 audit-write-failure rollback; NFR-A11Y-01 WCAG AA; NFR-INT-01 all strings via strings.es-EC.json; NFR-INT-02 no hardcoded currency or locale; NFR-RELIAB-01 cron idempotency; NFR-OPS-01 operator can run org-lifecycle from /admin; NFR-OBS-01 errors captured with PII redaction within 1 minute; NFR-OBS-02 drift status visible at /admin/drift; NFR-MAINT-01 single-language stack with shared entities; NFR-COST-01 R1 hosting < $30/month; NFR-PWA-01 installable on Android and iOS; NFR-PWA-02 read paths work offline after first load.

Recommended NFRs. NFR-BR-01 every loan stamps `group_config_version_at_origination` for replayability (per 09b §1 Pattern C). NFR-BR-02 golden-file tests for all 11 business rules in CI. NFR-PII-01 logging redaction unit-tested. NFR-PWA-03 Lighthouse PWA score >= 90 on mobile.

NFRs by Category.
- Performance: NFR-PERF-01, 02, 03.
- Availability and durability: NFR-AVAIL-01, NFR-DURAB-01.
- Security: NFR-SEC-01, 02, 03, 04.
- Accessibility: NFR-A11Y-01.
- Internationalization: NFR-INT-01, 02.
- Reliability and operability: NFR-RELIAB-01, NFR-OPS-01.
- Observability: NFR-OBS-01, NFR-OBS-02, NFR-PII-01.
- Maintainability: NFR-MAINT-01, NFR-BR-01, NFR-BR-02.
- Cost: NFR-COST-01.
- PWA: NFR-PWA-01, 02, 03.
---END-SECTION: SEC8---

---SECTION: SEC9---
Delivery Approach, Methodology and Governance

Methodology. Nous pipeline + BMAD per CLAUDE.md rule 13. Substrate gates per release (`nous_package.py drift --strict`, story `ready-check` registry, HR-25 timestamp-slug migrations). Solo development team; design-partner-led validation cadence.

Discovery Track. Phases 0 (done: Steps 0..6 + 9 + 9b), Phase 1 (Steps 7, 8 in progress, 10, 11). Design-partner walkthrough planned as M2 + M3 gates conflated.

Delivery Track. Phase 2 build R1 implementing the 73 features via the 13 epics below. Vercel preview per PR; Neon branch per preview. CI must pass type-check, lint, Vitest, axe-a11y, Drizzle migration check, golden-file business-rule tests. Production deploy on merge to main. Drift sweep cron at `/api/cron/drift-check`.

Governance Model. Product owner + engineer is Francisco; design partner is his mother; pilot exit criteria are three consecutive clean monthly closes plus a "would not go back to paper" confirmation. Substrate gaps file as IMPs (precedent: IMP-206 and IMP-207 already on file).
---END-SECTION: SEC9---

---SECTION: SEC10---
Assumptions, Dependencies and Constraints

Assumptions. Vercel Hobby tier accommodates R1 traffic with possible cron-limit upgrade to Pro; Neon Free tier accommodates R1 storage with possible upgrade for PITR window; Auth0 Free tier covers MAU and Organizations feature (verify OQ-ARCH-2). The design partner's group runs a monthly contribution cycle per `OQ-ER-A1` and the registers and quota mechanics confirmed at the design-partner walkthrough.

Dependencies. The Nous substrate; the Auth0 Organizations feature on the chosen plan; Vercel Cron limits on the chosen plan; the Neon-Vercel integration for branch-per-preview; the `@react-pdf/renderer` library; Serwist; Lucide; Inter (OFL).

Constraints. Treasurer device is a low-end Android with intermittent 3G; PWA must work offline-tolerant for reads; R1 ships in Spanish (es-EC) only; bus factor of 1 (solo team); cost < $30/month for R1; the brief's pilot launch target is 2026-10-28.
---END-SECTION: SEC10---

---SECTION: SEC11---
Risks and Mitigations

Risk Register.

| Risk | Description | Likelihood | Impact | Mitigation | Source (Explicit/Inferred) |
|---|---|---|---|---|---|
| risk_001 | Substrate gap blocks Mi Banquito delivery | Medium | High | File IMPs as gaps surface; precedent IMP-206 IMP-207 | Explicit |
| risk_002 | Bus factor of 1 solo developer | High | High | Deterministic pipeline outputs; clear docs; CLAUDE.md kept current | Explicit |
| risk_003 | Auth0 Organizations not on Free tier | Medium | Medium | Fallback to single Auth0 tenant plus org_id custom claim | Inferred |
| risk_004 | Vercel cron limits insufficient | Medium | Medium | Upgrade to Pro; consolidate cron tasks; document runbook R-1 | Inferred |
| risk_007 | Design partner rejects vocabulary or tone | Medium | Medium | Bi-weekly observation; brand voice variant strings.es-EC.json | Explicit |
| risk_008 | Cross-tenant query escape if RLS misconfigured | Low | Critical | Drizzle plus RLS plus migration tests | Explicit |
| risk_009 | Append-only trigger bypass via direct DB access | Medium | Medium | Operator runbook; IMP-process for direct-DB recovery | Explicit |
| risk_010 | Period-lock false-positive blocking legitimate write | Low | Low | Adjustment-period pattern documented in design system | Inferred |
| risk_011 | Service worker stale cache shows wrong balance | Medium | Medium | Cache strategy stale-while-revalidate; visible last-sync indicator | Explicit |
| risk_BR-1 | Time-weighted share-out math wrong leads to disputed payouts | Medium | High | Golden-file fixture from 09b BR-09 in CI plus property test | Inferred |
| risk_BR-2 | Loan engine misapplies admin fee or referral commission | Low | High | Golden-file fixture per BR-01 BR-03 BR-06 plus property tests | Inferred |
| risk_INFRA-1 | First-org provisioning takes longer than planned blocking pilot | Medium | Medium | Epic 0 stories are concrete and decomposed; provisioning checklist | New |
| risk_PWA-1 | iOS PWA install or notification rules break the install flow | Medium | Medium | Verify on real device; documented install instructions | New |
---END-SECTION: SEC11---

---SECTION: SEC12---
Deliverables, Milestones and High-Level Planning

Key Deliverables. (i) Provisioned Vercel + Neon + Auth0 + Vercel Blob + Sentry + Better Stack environments; (ii) Turborepo monorepo with `apps/web` and 5 packages (`db`, `contracts`, `domain`, `ui`, `config`); (iii) production-ready treasurer console and thin admin slice with PWA install on Android and iOS; (iv) golden-file business-rule test suite; (v) per-org export ZIP generation; (vi) impersonation read-only with audit trail; (vii) the first design-partner organization onboarded with treasurer invite and successful first contribution.

Milestones / Phases. Phase 1 Foundations (Steps 7, 8 here, 10, 11; 6-8 weeks). Phase 2 Build R1 (Epic 0 plus Epics 1-12; 6-8 weeks). Phase 3 Pilot (4 weeks). Phase 4 R2 planning (open).

Timeline Notes. Brief target pilot 2026-10-28. With Step 9b business-rules complexity (declining-balance + time-weighted + new entities), Phase 2 may push to 8 weeks rather than 6; flag for design-partner conversation.
---END-SECTION: SEC12---

---SECTION: SEC13---
Open Questions and Recommendations

Open Questions for the Client. None blocking — all open questions from `09b` were resolved on 2026-05-28. Carried-forward open questions for verification at the design-partner walkthrough: visual canvas acceptance (cream vs cooler off-white), tu vs usted register confirmation, member-side PDF artifact trust test, vocabulary words substitution if her group uses different terms.

Recommendations. Recommendation Begin Epic 0 immediately in parallel with Step 7 (Screens). The infra provisioning has lead-time on Auth0 plan verification and Neon-Vercel integration setup; Step 7 can complete in parallel without dependency on the provisioned environment. Recommendation Run design-partner walkthrough (M2 + M3 gates conflated) before Step 10 (Plan) so the time-weighted share-out wizard + base-fund quota flow are pre-validated. Recommendation Decompose the loan engine domain package (`packages/domain/rules/loans/*`) ahead of UI work to lock the BR-01 + BR-03 golden file before any UI is built against it.
---END-SECTION: SEC13---

---SECTION: SEC14---
Commercial Proposal Scope Narrative

Executive Narrative.

Mi Banquito is a multi-tenant SaaS treasury system for informal community savings and lending groups across Latin America. The product addresses a concrete and recurring problem: in the Andean region and broader LATAM, hundreds of thousands of community groups pool their savings and lend among themselves under self-defined rules, with a single non-technical treasurer carrying the entire ledger on paper, in Excel, and in WhatsApp scrolls. The treasurer bears personal reputational risk for every cent of the group's money, and the available cooperative-banking software is built for formal SEPS-registered cooperatives that these groups do not want to become. There is no incumbent product at the closed-group informal tier.

R1 of Mi Banquito ships as a single Next.js 16 progressive web application that installs on Android and iOS phones without an app store, and delivers two distinct surfaces from the same codebase. The treasurer console is Spanish-first, vocabulary-locked to the actual words a community treasurer uses, with large default typography and generous tap targets calibrated for a low-end Android phone in outdoor light on intermittent 3G. The thin platform admin slice is a separate route group for the FcoStudios operator, who handles organization lifecycle, read-only impersonation, data export, and substrate drift surfacing. Both surfaces share the same design tokens; they diverge deliberately in density and voice so that tenant simplicity does not leak into the admin surface and admin density does not leak back into the tenant surface.

Functionally, the R1 release covers the full monthly cycle of an Andean banquito: group setup and member registry, contribution recording with deposit-slip evidence, the annual per-member base-fund quota as a separate transaction, loan origination with full schedule generation under a configurable declining-balance interest model, a 1 % administrative fee charged on the first installment, member-vs-non-member rate bands with member-guarantor support for non-member borrowers, optional referral commissions credited to the referrer member on full loan payoff, repayment recording with automatic interest-first split, daily interest accrual driven by a Vercel Cron Job, fully workflow-shaped reconciliation and monthly close, per-member PDF statements with cryptographic integrity hashes shared via WhatsApp, treasurer compensation disbursements on a fixed monthly or yearly schedule, and the year-end share-out wizard with a time-weighted per-member breakdown by source and treasurer-overridable amounts. The cash-flow projector and alert engine close the loop on liquidity management: the projector consumes the ledger, scheduled repayments, planned expenses, and the base-fund floor to project the pool balance forward twelve months and surface alerts when the projection falls below the safety margin or when the year-end share-out commitment exceeds the projected capacity. The treasurer never recomputes; she records, and the system tells her what she needs to know.

Architecturally, the solution is intentionally a modular monolith on a managed platform. The substrate (Vercel, Neon Postgres, Auth0 with Organizations, Vercel Blob, Sentry) was selected because each component offers a free or low-cost tier covering R1 traffic, because the operator is a solo developer who must minimize operational surface area, and because the unified TypeScript stack across UI and API enables a single source of truth for entities, validation, and types. Drizzle ORM table definitions feed `drizzle-zod` schema inference, which feeds both React Hook Form on the client and Server Action input validation on the server. The entity shape, runtime validation, and TypeScript types cannot drift from each other because they are all derived from the same source. Business rules are encoded as pure-TypeScript functions parameterized by per-organization configuration values stored in `GroupConfig`; every loan stamps the configuration version active at origination, so any past schedule can be reconstructed exactly. Golden-file tests in `packages/domain/rules/__fixtures__` lock the numerical behavior of the 11 business rules into the continuous integration pipeline.

The substrate enforces the non-negotiable invariants of a money product at the database layer rather than relying on application convention. PostgreSQL Row-Level Security policies on every tenant table ensure that no query can ever return data belonging to a different organization, regardless of whether the application code remembers to include the predicate. Row triggers raise an `append_only_violation` exception on any `UPDATE` or `DELETE` against the five ledger tables, so a developer who tries to "fix" a wrong contribution can only do so through the documented reversal pattern. A separate trigger compares each new ledger entry's `dated_on` against the most recent `PeriodClose.closed_at` for the same cycle and rejects late-arriving entries, enforcing the period-lock invariant that makes the prior month's statement immutable. The audit log row is written in the same transaction as the originating action; an audit-write failure rolls back the originating action, so there can be no untraceable mutation. These four invariants — cross-tenant safety, append-only ledger, period-lock immutability, and audit-before-action — are enforced at the database boundary; the developer who eventually drifts in app code cannot accidentally violate them.

Delivery follows the Nous pipeline conventions and the BMAD method. Phase 0 (Steps 0..6 + 9 + 9b) is complete: product brief, market research, four personas including the platform-operator persona, six tenant journeys, a service-blueprint backstage-process catalogue, a 22-entity ER model with explicit append-only and period-lock semantics, a brand identity grounded in the "digital notebook" metaphor, a complete design system with codegen-ready tokens, an architecture document with seventeen Architecture Decision Records, and a comprehensive business-rules catalogue with eleven locked rules. Phase 1 Foundations (Steps 7, 8 here, 10, 11) is in progress; Phase 2 (build R1) follows. The pilot launch target is 2026-10-28 with a 4-6 month window. The first design partner is the founder's mother's banquito in Ecuador; pilot exit criteria are three consecutive clean monthly closes plus a "would not go back to paper" confirmation from the design partner.

Out of scope for R1 are member-side login and self-service balance lookup (deferred to R2), WhatsApp Business API integration for automated receipts (R2), OCR on deposit-slip photos (R2), bank-API or open-banking statement import (R3), multi-currency per organization (designed-for and gated to R3), SMS notifications, native iOS or Android apps, multi-operator platform roles, BI dashboards, cross-tenant analytics, anti-fraud rule engines, compound or simple-with-fee interest rate models beyond the declining-balance default and the legacy flat-per-period fallback, member self-onboarding to take a loan, in-app loan-approval voting, late-fee automation, automatic guarantor debits on non-member default, and encryption-at-rest of member WhatsApp numbers. The exclusions are deliberate and documented so that the pilot can validate the core trust-instrument value of the product before scope expansion.

The principal risks to delivery are the bus factor of one (a solo developer), the substrate-coupled delivery (gaps in the Nous pipeline surface as IMP filings and can delay the project, with the IMP-206 and IMP-207 precedents already documented as part of this project setup), and the possibility that the time-weighted share-out math or the loan engine's declining-balance + admin-fee logic could produce surprising results on edge cases. The mitigations are the deterministic pipeline outputs (which let any future operator pick up where this one left off without context loss), the IMP catalogue (which formalizes substrate-fix work with the same rigor as project-content work), and the golden-file plus property-based test suite (which locks the numerical behavior of every business rule against regression). The pilot exit criteria deliberately include a multi-month observation window so any latent bugs surface against real money before scope expansion. The commercial proposition is a low-cost, high-trust, calmly-engineered system of record for a class of users who have so far had no purpose-built tool — delivered on a single managed stack within a four-to-six month window for under thirty dollars per month in hosting cost.
---END-SECTION: SEC14---

---

# User Story Inventory (Annex)

> **Format.** Each story carries: title, persona, value statement, key acceptance criteria, prerequisites (dependency IDs), information required (entity attributes the screen needs), journey/process trace, target screens, components introduced, and a gap callout where applicable. Stories grouped by epic. R1 = required for pilot release.

## Epic 0 — Base Scaffolding + Infra Provisioning (FEAT-001..FEAT-015)

### US-001 — Initialize Turborepo monorepo with apps/web and 5 packages
- **As**: Operator (P04) | **Want to**: scaffold the codebase structure | **So that**: feature work has a place to land
- **AC**: `apps/web` Next.js 16 app + `packages/db`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/config` packages defined; `turbo.json` with build / dev / type-check / test / lint tasks; pnpm-workspaces.yaml; pnpm install succeeds
- **Prerequisites**: none (this is the root story)
- **Info needed**: stack decisions from `09_architecture.md §9`
- **Journey/Process**: PA-S0
- **Screens**: n/a (infra)
- **Components introduced**: monorepo scaffold
- **Gap callout**: NEW — not previously documented as a story

### US-002 — Provision Vercel project with custom domain + preview deploys
- **As**: Operator | **Want to**: have a hosted production + preview surface | **So that**: every PR is testable before merge
- **AC**: Vercel project linked to GitHub repo; production deploy on `main`; preview deploy on PR; custom domain `mibanquito.app` (or chosen) attached; HTTPS via Vercel
- **Prerequisites**: US-001
- **Info needed**: domain choice
- **Journey/Process**: PA-S0
- **Screens**: n/a
- **Gap callout**: NEW

### US-003 — Provision Neon project with branching per Vercel preview
- **As**: Operator | **Want to**: have a managed Postgres + isolated DB per preview | **So that**: migrations don't contaminate production
- **AC**: Neon project + main branch provisioned; Neon-Vercel integration installed; preview branches auto-created and cleaned 7 days post-PR-close; `DATABASE_URL` injected
- **Prerequisites**: US-002
- **Journey/Process**: PA-S0
- **Gap callout**: NEW

### US-004 — Provision Auth0 tenant with Organizations + FcoStudios org
- **As**: Operator | **Want to**: have identity ready | **So that**: treasurers can log in and tenants are isolated at the IdP
- **AC**: Auth0 tenant created; Organizations feature verified on selected plan (OQ-ARCH-2 fallback documented if not free); FcoStudios Auth0 org seeded; passwordless email connection enabled
- **Prerequisites**: US-002
- **Journey/Process**: PA-S0
- **Gap callout**: NEW; depends on `OQ-ARCH-2` Auth0 Organizations free-tier verification

### US-005 — Provision Vercel Blob + Sentry + Better Stack
- **As**: Operator | **Want to**: have object store + observability ready | **So that**: slip photos store somewhere + errors are visible + uptime is monitored
- **AC**: Vercel Blob store + read/write token; Sentry project + DSN; Better Stack monitor pointed at `/api/health`
- **Prerequisites**: US-002
- **Gap callout**: NEW

### US-006 — Configure environment variables across local + preview + prod
- **As**: Operator | **Want to**: have a single source of truth for env vars | **So that**: secrets don't leak and previews work
- **AC**: `DATABASE_URL`, `AUTH0_*`, `CRON_SECRET`, `SENTRY_DSN`, `VERCEL_BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN` set per environment; `.env.example` checked in; `.env.local` gitignored
- **Prerequisites**: US-003, US-004, US-005
- **Gap callout**: NEW

### US-007 — Set up Next.js 16 App Router with treasurer + admin route groups
- **As**: Operator | **Want to**: have the shell of the application | **So that**: feature stories can drop into route groups
- **AC**: `app/(treasurer)/` and `app/(admin)/` route groups created; root `app/layout.tsx` with Spanish lang attribute; placeholder home screens for each surface; `next.config.ts` with experimental typedEnv enabled
- **Prerequisites**: US-001
- **Gap callout**: NEW

### US-008 — Set up Drizzle initial migration with all entity tables + RLS + triggers + materialized views
- **As**: Operator | **Want to**: have the database schema as the single source of truth | **So that**: the application can read and write entities with the architectural invariants enforced at the DB layer
- **AC**: `packages/db/schema/*` for all 29 entities (22 from `04_er_model.md` + 7 from `09b §6`); migrations applied to main; RLS policies on every tenant table; append-only triggers on 5 ledger tables; period-lock trigger; audit-before-action pattern wired; materialized views `mv_member_compliance_state`, `mv_ar_aging`, `mv_liquidez_proyectada`, `mv_member_time_weighted_balance`, `mv_interest_gains_per_fiscal_year`, `mv_base_fund_pool_per_fiscal_year`, `mv_available_capital`; preview branch migration tested per PR
- **Prerequisites**: US-003, US-007
- **Info needed**: full ER model from `04_er_model.md` + new entities from `09b §6`
- **Gap callout**: SIGNIFICANT — drives `packages/db` package; 09b additions require migration update

### US-009 — Set up Tailwind 4 + design tokens + strings.es-EC.json + Lucide allow-list
- **As**: Operator | **Want to**: have the design system codegen-ready | **So that**: feature stories use locked tokens and locked vocabulary
- **AC**: Tailwind 4 with `packages/config/tailwind-preset` consumed by `apps/web` and `packages/ui`; `packages/ui/src/tokens/tokens.v1.json` shipped per `06_design_system.md §SEC9`; `packages/ui/src/strings/strings.es-EC.json` with locked vocabulary; Lucide allow-list as TypeScript constant in `packages/ui`
- **Prerequisites**: US-007
- **Gap callout**: NEW; consumes `06_design_system.md` output

### US-010 — Set up Serwist service worker + PWA manifest + install on Android + iOS
- **As**: Operator + Treasurer | **Want to**: install Mi Banquito as a PWA | **So that**: it appears on the home screen without app store
- **AC**: `app/manifest.ts` with es-EC name, theme color from tokens, icons (192, 512), `apple-touch-icon`; Serwist service worker registered; install prompt appears at right moment on Android; iOS install instructions documented; Lighthouse PWA score ≥ 90
- **Prerequisites**: US-009
- **Gap callout**: NEW

### US-011 — Set up auth middleware (Auth0 session extraction + RLS session var)
- **As**: Operator | **Want to**: have multi-tenant safety as a substrate behavior | **So that**: no Server Action or Server Component can leak across tenants
- **AC**: `middleware.ts` extracts `org_id` from Auth0 session; Postgres session variable `app.current_org` set before any DB query; admin role bypasses with separate role; integration test verifies RLS rejects cross-tenant query
- **Prerequisites**: US-004, US-008
- **Gap callout**: NEW

### US-012 — Set up Vercel Cron config for daily interest, treasurer compensation, drift sweep
- **As**: Operator | **Want to**: have scheduled jobs running | **So that**: interest accrual and compensation disbursement happen without manual intervention
- **AC**: `vercel.json` cron entries (or dashboard config) for `/api/cron/accrue-interest` at 05:00 UTC, `/api/cron/award-treasurer-compensation` at 06:00 UTC, `/api/cron/drift-check` at 07:00 UTC; bearer secret protection; cron limit verified per plan (`OQ-ARCH-1`)
- **Prerequisites**: US-007
- **Gap callout**: NEW; depends on `OQ-ARCH-1` Vercel Hobby cron-limit verification

### US-013 — Set up CI pipeline (type-check + lint + test + Drizzle migration check + axe a11y)
- **As**: Operator | **Want to**: have automated quality gates | **So that**: regressions are caught before merge
- **AC**: Vercel CI runs `pnpm type-check`, `pnpm lint`, `pnpm test`, Drizzle migration dry-run against preview branch, axe-core a11y test on key screens; PR cannot merge with red CI
- **Prerequisites**: US-001
- **Gap callout**: NEW

### US-014 — Set up business-rule test infrastructure (golden file + property-based)
- **As**: Operator | **Want to**: have rule fidelity guaranteed in CI | **So that**: BR-XX behavior cannot regress unnoticed
- **AC**: `packages/domain/rules/__fixtures__/*.json` directory; fast-check or vitest property-based setup; the BR-01 declining-balance fixture matches the worked example in `09b_business_rules.md §4 BR-01` bit-for-bit; CI runs both golden-file and property tests
- **Prerequisites**: US-001
- **Gap callout**: NEW per `09b §3`

### US-015 — Set up Auth0 magic-link passwordless email flow
- **As**: Operator | **Want to**: have treasurers log in without passwords | **So that**: the device-fluent but password-averse treasurer can authenticate
- **AC**: `/app/auth/[auth0]/route.ts` catch-all; `passwordless.start({connection:'email', send:'link'})`; `/auth/callback` creates session; tested for Francisco's mother's email
- **Prerequisites**: US-004, US-007
- **Gap callout**: NEW

---

## Epic 1 — Platform Lifecycle (FEAT-016..FEAT-024)

### US-016 — Operator creates a new tenant organization
- **As**: Operator | **Want to**: spin up a new banquito tenant in under an hour | **So that**: the < 1-day onboarding KPI is met
- **AC**: `/admin/orgs/new` form (display name, country, currency, timezone, branding logo upload); Server Action creates `Organization` row + Auth0 Organization via Management API + seeds `GroupConfig` v1 from defaults; audit log entry; redirects to org detail
- **Prerequisites**: US-011, US-015
- **Info needed**: name, country (es-EC), currency (USD), timezone (`America/Guayaquil`), default language (`es-EC`), branding logo (optional file)
- **Journey/Process**: PA-S1, P19 PlatformAuditWrite, comp_platform_ops_011
- **Screens**: SCR-admin-orgs (list), SCR-admin-orgs-new (form), SCR-admin-org-detail
- **Gap callout**: confirms FEAT-016 from architecture; uses Auth0 Organizations or single-tenant fallback per OQ-ARCH-2

### US-017 — Operator configures group rules including all 11 business rules
- **As**: Operator | **Want to**: capture the group's specific rules at setup | **So that**: the loan engine and share-out engine operate per the group's actual policy
- **AC**: `/admin/orgs/[id]/config` form covers: contribution cycle (kind, amount, opens_on day), loan rate model (declining_balance default), loan rate value (member + non_member separately), period unit (monthly default), grace periods, loan-to-savings cap, admin fee pct, referral commission amount, treasurer compensation (kind + amount + period), base fund quota for current fiscal year, fiscal year start month + day, year-end share-out formula, reconciliation tolerance, late + mora thresholds; saving writes a new `GroupConfig` version (HR-1); audit log entry; surfaces a "read this with your treasurer" summary in es-EC
- **Prerequisites**: US-016
- **Info needed**: every column on `GroupConfig` per `09b` extensions
- **Journey/Process**: PA-S2; comp_platform_ops_011
- **Screens**: SCR-admin-org-config
- **Components introduced**: new admin form sub-sections for each BR
- **Gap callout**: SIGNIFICANT — this single screen exposes all 11 business rules; needs careful form UX

### US-018 — Operator invites the treasurer via Auth0 organization invite
- **As**: Operator | **Want to**: hand off authentication to the treasurer | **So that**: she can log in via magic link
- **AC**: form (treasurer email, display name); Server Action creates `Member` row with `role = 'tesorera'`, `auth_subject` set after Auth0 invite acceptance; sends Auth0 Organization invitation email; audit log entry
- **Prerequisites**: US-016, US-015
- **Info needed**: treasurer's email + display name
- **Journey/Process**: PA-S3
- **Screens**: SCR-admin-org-detail (invite section)

### US-019 — Operator views per-org health snapshot on admin home
- **As**: Operator | **Want to**: spot struggling tenants at a glance | **So that**: I can reach out before they abandon
- **AC**: `/admin` home shows table per org: name, last activity, last close date, reconciliation status (green/red), open loans count, A/R total, drift status badge
- **Prerequisites**: US-008, US-011
- **Info needed**: aggregate of `mv_*` views per org
- **Journey/Process**: PA-S4
- **Screens**: SCR-admin-home

### US-020 — Operator starts read-only impersonation with required reason
- **As**: Operator | **Want to**: see the treasurer's UI as she sees it | **So that**: I can debug support calls without guessing
- **AC**: `/admin/orgs/[id]/impersonate` requires `reason` text; on submit, INSERTs `Impersonation` row with `mode = read_only`, short-lived cookie set; switches `app.current_org` to target; any write attempt returns 403; "Salir de impersonación" ends the session and writes the end audit
- **Prerequisites**: US-016
- **Info needed**: reason (free text)
- **Journey/Process**: PA-S5; comp_platform_ops_011 + comp_auth_middleware_015
- **Screens**: SCR-admin-impersonation (start), banner during impersonation across all treasurer screens

### US-021 — Operator exports tenant data as ZIP with CSVs + PDFs + manifest
- **As**: Operator | **Want to**: honor the data-ownership commitment | **So that**: a tenant can leave with their data
- **AC**: `/admin/orgs/[id]/export` Server Action streams a ZIP containing one CSV per entity (members, contributions, withdrawals, expenses, loans, repayments, interest accruals, base fund quotas, fees, referrals, statements, audit log), all StatementArchive PDFs, `manifest.json`, `audit_log.csv`, and bilingual README; audit log records the export
- **Prerequisites**: US-008, US-011
- **Info needed**: all org-scoped tables; all StatementArchive blobs
- **Journey/Process**: PA-S6
- **Screens**: SCR-admin-export (trigger)

### US-022 — Operator views audit bitácora across orgs with dense filters
- **As**: Operator | **Want to**: investigate dispute or anomaly across tenants | **So that**: forensic trail is queryable
- **AC**: `/admin/audit` dense table with filters: org, actor kind, action kind, date range; CSV export; raw `payload_snapshot` JSON viewer per row
- **Prerequisites**: US-008
- **Screens**: SCR-admin-audit

### US-023 — Operator views substrate drift status + last-check timestamp
- **As**: Operator | **Want to**: see substrate health | **So that**: I file an IMP before tenants are affected
- **AC**: `/admin/drift` shows: drift status badge (green/red), last check timestamp, raw drift report text; integrates with `nous_package.py drift --strict` output via Vercel Cron `/api/cron/drift-check`
- **Prerequisites**: US-012
- **Screens**: SCR-admin-drift

### US-024 — Operator views per-org business-rules panel
- **As**: Operator | **Want to**: see which rule values are active per org and who changed them | **So that**: I can audit rule changes without reading code
- **AC**: `/admin/orgs/[id]/business-rules` reads current `GroupConfig` + `EntityVersion` history per BR-XX field; renders dense table; CSV export
- **Prerequisites**: US-017
- **Screens**: SCR-admin-business-rules
- **Components introduced**: `organism.business-rules-panel`
- **Gap callout**: NEW per `09b §6` handoff

---

## Epic 2 — Treasurer Onboarding + Group Setup (FEAT-025..FEAT-028)

### US-025 — Treasurer completes the first-run group setup wizard (3 screens)
- **As**: Treasurer (P01) | **Want to**: name my group and confirm rules | **So that**: I can start recording aportes
- **AC**: 3-screen wizard: (a) group name + optional logo, (b) confirm rules summary (read-only display of op-set config + "Esto es lo que tu grupo decidió"), (c) "¡Listo! Vamos a registrar las socias"; resumable if abandoned
- **Prerequisites**: US-018
- **Info needed**: `Organization`, `GroupConfig` (current version)
- **Journey/Process**: S1; comp_platform_ops_011 (config seeded)
- **Screens**: SCR-first-run-wizard

### US-026 — Treasurer adds a member with name, WhatsApp, role, initial savings
- **As**: Treasurer | **Want to**: register a member in 1-screen | **So that**: I can record her aportes immediately
- **AC**: single-screen form (display name required, WhatsApp number optional E.164-masked, role default `aportante`, joined-on default today, initial savings default 0); writes `Member` row + `EntityVersion`; audit log; redirects to member list with new row highlighted
- **Prerequisites**: US-025
- **Info needed**: display name, WhatsApp (optional), joined-on (default today), initial savings (default 0)
- **Journey/Process**: S1 step 1; P1 path
- **Screens**: SCR-members-list (with "Agregar socia" CTA), SCR-add-member

### US-027 — Treasurer changes a member status to `en_pausa` or `baja` with refund A/P entry
- **As**: Treasurer | **Want to**: freeze or exit a member cleanly | **So that**: the historical record stays intact and the refund is bookkept
- **AC**: from SCR-member-detail, action "Pausar" or "Dar de baja"; if `baja`, prompts for refund amount default = accumulated savings; on submit, INSERTs `EntityVersion` for status transition + INSERTs `Expense` of `kind = member_refund` for refund; audit log
- **Prerequisites**: US-026
- **Info needed**: member, reason, refund amount (if `baja`)
- **Journey/Process**: S1 step 3; P2 RecordWithdrawal
- **Screens**: SCR-member-detail (status action sub-section)

### US-028 — Treasurer views and edits group rules (read-only first, then edits with HR-1 versioning)
- **As**: Treasurer | **Want to**: see my group's rules and update them when the group votes | **So that**: the system stays aligned with the bylaws
- **AC**: `/grupo` shows current rule values; "Editar reglas" opens form; saving creates new `GroupConfig` version; existing loans keep their stamped version (per OQ-BR2-1); audit log
- **Prerequisites**: US-025
- **Info needed**: all GroupConfig columns; current version
- **Journey/Process**: S1; comp_business_rule_engine_013
- **Screens**: SCR-group-config

---

## Epic 3 — Contribution Cycle (FEAT-029..FEAT-032, FEAT-058)

### US-029 — Treasurer records a contribution with slip photo and optional notes
- **As**: Treasurer | **Want to**: record a deposit in 3 taps | **So that**: I'm done with the entry before the next WhatsApp arrives
- **AC**: SCR-record-contribution: member picker (forgiving partial-name search), amount (currency-input with locale), date default today, slip photo (camera or gallery; ≤ 1024 px long edge; ≤ 5 MB), optional notes; Server Action with `client_request_id` UNIQUE for idempotent retries; inline success copy "Aporte de {member_name} registrado — {currency} {amount}, {date}"; A/R aging refreshes
- **Prerequisites**: US-008, US-009, US-026
- **Info needed**: member, amount, dated_on, slip photo, cycle_id (active cycle), client_request_id
- **Journey/Process**: S2 step 2; P1 RecordContribution
- **Screens**: SCR-record-contribution
- **Components**: `molecule.member-picker`, `molecule.currency-input`, `molecule.slip-uploader`, `molecule.confirmation-modal`

### US-030 — Treasurer reverses a prior contribution with required reason
- **As**: Treasurer | **Want to**: undo a wrong entry without deleting | **So that**: the historical record stays intact and trust is preserved
- **AC**: from SCR-history or member-detail transaction row, "Hacer una reversión" → confirmation modal with full Spanish sentence + required reason input + destructive button; writes new `Contribution` row with `reverses_id` + `reverse_reason`; audit log
- **Prerequisites**: US-029
- **Info needed**: original contribution; reason
- **Journey/Process**: S2; pattern.reversal
- **Screens**: confirmation modal triggered from history or detail

### US-031 — Treasurer views live compliance state per member with green/amber/red encoding
- **As**: Treasurer | **Want to**: know who's up-to-date | **So that**: I chase the right people
- **AC**: `/socias` and SCR-treasurer-home both show member rows with `status-pill` rendering `al_día / atrasado / en_mora`; the encoding is single-source-of-truth from `mv_member_compliance_state`; updates within seconds of any contribution
- **Prerequisites**: US-008, US-029
- **Info needed**: `mv_member_compliance_state` derived from contribution + cycle + group_config thresholds
- **Journey/Process**: S2 step 4; P7 RecomputeMemberCompliance
- **Screens**: SCR-members-list, SCR-treasurer-home

### US-032 — Treasurer records the annual base-fund quota payment for a member
- **As**: Treasurer | **Want to**: capture the annual base-fund cuota separately from regular aportes | **So that**: the base-fund pool is correctly built and "available capital" is correctly derived
- **AC**: NEW SCR-record-base-fund-quota: member picker, amount (default = `BaseFundQuotaConfig.per_member_amount` for current fiscal year), date default today, slip photo optional; writes `BaseFundQuotaPayment` row; refreshes `mv_base_fund_pool_per_fiscal_year` and `mv_available_capital`; audit log
- **Prerequisites**: US-008, US-017 (BaseFundQuotaConfig must exist for current fiscal year), US-026
- **Info needed**: member, fiscal_year, amount (from quota config), dated_on, optional slip photo
- **Journey/Process**: S2 (separate flow); P24 CollectBaseFundQuota
- **Screens**: SCR-record-base-fund-quota (NEW)
- **Components**: `molecule.member-picker`, `molecule.currency-input`, `molecule.slip-uploader`
- **Gap callout**: NEW per OQ-BR8-1 (option a). Original design system did not include this screen.

### US-058 — Treasurer views balance for any member via partial-name search on home
- **As**: Treasurer | **Want to**: answer "¿cuánto tengo?" instantly | **So that**: members get an immediate answer over WhatsApp
- **AC**: SCR-treasurer-home has a member-picker that opens to member-detail in 1 tap; balance prominent (28 px tabular figures); "Compartir saldo por WhatsApp" share intent
- **Prerequisites**: US-026, US-031
- **Info needed**: member's current balance from `mv_member_compliance_state` + share template
- **Journey/Process**: S6 step 1-3 TO-BE
- **Screens**: SCR-treasurer-home, SCR-member-detail

---

## Epic 4 — Loan Lifecycle (FEAT-033..FEAT-039)

### US-033 — Treasurer originates a member loan with auto-generated declining-balance schedule
- **As**: Treasurer | **Want to**: issue a loan to a member with all the math computed | **So that**: I never compute interest by hand
- **AC**: SCR-originate-loan: borrower kind selector default `member`; member picker; principal amount; term periods; purpose optional; eligibility pre-flight (pool capacity minus base fund, loan-to-savings cap for borrower); if cleared, writes `Loan` row stamping `group_config_version_at_origination` + generates `LoanSchedule` rows per BR-01 declining-balance + writes `LoanFee` for installment 1 (1 % admin fee per BR-03); audit log; redirects to loan detail; if not cleared, shows explanatory copy in es-EC
- **Prerequisites**: US-008, US-014 (BR-01 + BR-03 golden file passing), US-017 (rates configured), US-026
- **Info needed**: borrower (member), principal, term_periods, rate (from GroupConfig.member rate), grace, purpose
- **Journey/Process**: S3 step 1-3; P3 OriginateLoan + P4 GenerateLoanSchedule + P10 EvaluateLoanEligibility
- **Screens**: SCR-originate-loan, SCR-loan-detail
- **Components**: `molecule.borrower-picker` (NEW), `molecule.currency-input`, `molecule.fee-row` (NEW), `organism.schedule-table`

### US-034 — Treasurer originates a non-member loan with required guarantor picker
- **As**: Treasurer | **Want to**: lend to a non-member who has a member as collateral | **So that**: the group can extend its reach with risk capped
- **AC**: SCR-originate-loan with borrower kind = `non_member` reveals: non-member borrower mini-form (display name, WhatsApp, national-id-redacted-tail-4-digits, notes) + required member-guarantor picker (member status = activo + within loan-to-savings cap); rate auto-switches to `GroupConfig.loan_rate_value_non_member`; eligibility pre-flight rejects without guarantor; writes `NonMemberBorrower` + `Loan` (borrower_kind = non_member, borrower_non_member_id set) + `LoanGuarantor`; audit log
- **Prerequisites**: US-008, US-017
- **Info needed**: non-member fields, guarantor member, principal, term, rate (non_member from GroupConfig), purpose
- **Journey/Process**: S3 step 1-3 variant; P3 OriginateLoan extended
- **Screens**: SCR-originate-loan (extended)
- **Components**: extended `molecule.borrower-picker` with non-member variant; new `molecule.guarantor-picker`; sub-form for `NonMemberBorrower`
- **Gap callout**: NEW per BR-05; new entities and new picker

### US-035 — Treasurer optionally designates a referrer member on origination
- **As**: Treasurer | **Want to**: record who referred the borrower | **So that**: the referral commission is credited on payoff
- **AC**: SCR-originate-loan has optional `molecule.referrer-picker` (member status = activo); if set, `Loan.referrer_member_id` recorded + `LoanReferral` row created with `commission_amount` stamped from `GroupConfig.referral_commission_amount`; if unset, no commission flow
- **Prerequisites**: US-017 (GroupConfig.referral_commission_amount set), US-033 or US-034
- **Info needed**: referrer (optional member)
- **Journey/Process**: S3 step 1; BR-06 origination side
- **Screens**: SCR-originate-loan
- **Components**: `molecule.referrer-picker` (NEW)
- **Gap callout**: NEW per BR-06

### US-036 — Treasurer records a loan repayment with auto-split (interest-first)
- **As**: Treasurer | **Want to**: record a payment in 3 taps | **So that**: I don't have to do interest-vs-principal math
- **AC**: SCR-record-repayment: member picker (auto-filters to members with open loans), loan picker (auto-fills if member has 1 open loan), amount (currency input), date default today, slip photo optional, notes optional; Server Action computes split per BR-06 split rule (`interest_first` default) + writes `Repayment` row with `applied_to_principal` + `applied_to_interest` + writes ledger leg + audit; if loan now `pagado`, fires referral commission flow (FEAT-039); inline success copy with split breakdown
- **Prerequisites**: US-008, US-014, US-033 (or 034)
- **Info needed**: member, loan, amount, dated_on, current loan state for split
- **Journey/Process**: S3 step 6; P6 ApplyRepayment
- **Screens**: SCR-record-repayment
- **Components**: `molecule.currency-input`, `molecule.slip-uploader`

### US-037 — Treasurer views loan detail with schedule + fees + repayments + accruals + referrer + guarantor
- **As**: Treasurer | **Want to**: see the full story of a loan | **So that**: I can answer any question about its state
- **AC**: SCR-loan-detail with tabs: Resumen (principal, rate, term, status, member, borrower kind, guarantor if non-member, referrer if any), Cronograma (schedule + paid-to-date per row + admin fee on row 1), Pagos (repayment list with splits), Historial (interest accruals + reversal entries), Acciones (record repayment, hacer reversión if applicable)
- **Prerequisites**: US-033, US-036
- **Info needed**: Loan + LoanSchedule[] + Repayment[] + InterestAccrual[] + LoanFee[] + LoanReferral + LoanGuarantor
- **Journey/Process**: S3; comp_loan_engine_002
- **Screens**: SCR-loan-detail (extended with new tabs)
- **Components**: extended `organism.loan-card`

### US-038 — System fires daily interest accrual cron (idempotent on loan_id + accrued_on)
- **As**: System (P05) | **Want to**: post per-period accrual entries every day for every active loan | **So that**: the cash-flow projector and reports always reflect accurate state
- **AC**: `/api/cron/accrue-interest` Route Handler with bearer auth; iterates per org per active loan per missing date; INSERTs `InterestAccrual` with UNIQUE constraint on (loan_id, accrued_on); refreshes `mv_liquidez_proyectada`; emits A6 for any loan transitioning to `en_mora`; **(CHG-002 / BR-17)** for any installment past `GroupConfig.mora_threshold_days`, also INSERTs an idempotent `LoanFee(fee_kind='mora')` (UNIQUE on `loan_id, fee_kind, accrued_on`) using `GroupConfig.config.mora` resolved **per accrual day** (`asOf=accrued_on`, stamping `LoanFee.group_config_version`), amount per `config.mora.mechanic` (Mi Banquito `flat_per_day` × `per_day_amount`) bounded by `config.mora.cap`; `config.mora.scope` gates loans-only; end-of-run summary alerts operator if failures; supports `from_date / to_date` query param for replay (replay yields no duplicate `LoanFee` rows)
- **Prerequisites**: US-008, US-012
- **Info needed**: all active loans across orgs, their schedules + repayments; `GroupConfig.config.mora`
- **Journey/Process**: S3 cron; P5 AccrueInterestDaily
- **Screens**: n/a (cron)

### US-100 — BR config substrate + resolution contract (CHG-002; precedes the config-driven rules)
- **As**: System (D-ARCH-1/2/3) | **Want to**: a typed/validated config lane + a deterministic config resolver | **So that**: config-driven rules (mora, two-pool) read the right values/version purely and replayably
- **AC**: add `GroupConfig.config jsonb` lane with a `RuleConfig` zod schema (`config.mora`, `config.distribution` reserved); `loadConfig(orgId, asOf)` returns a frozen `RuleContext` — resolves the GroupConfig version, validates via zod (write+read), deep-merges platform defaults under per-group overrides (defaults-at-read for keys absent on old versions; never backfill a versioned row); rule **registry keyed by BR-id**; temporal resolution modes (stamped / period-locked / per-accrual-day) implemented; all money math `decimal(18,4)`. Golden + property tests for the resolver/defaults/validation.
- **Prerequisites**: US-008
- **Journey/Process**: cross-cutting (Layer 2 rule execution)
- **Screens**: n/a

### US-101 — Formalize `LoanFee` + `GroupConfig.config.mora` (migration, CHG-002)
- **As**: System | **Want to**: a first-class `LoanFee` entity + per-group mora config | **So that**: admin (BR-03) and mora (BR-17) fees have a typed home that feeds the surplus base
- **AC**: HR-25 timestamp-slug migration creating `LoanFee` (`fee_kind admin|late|mora`, `UNIQUE(loan_id,fee_kind,accrued_on)`, `group_config_version`, `feeds_surplus`, `reverses_id`/`reverse_reason`, `account_id`); re-point the existing admin-fee write to `fee_kind='admin'` (no behavior change); seed Mi Banquito `config.mora = {mechanic:flat_per_day, per_day_amount:0.25, cap:{kind:overdue_installment}, day_count:calendar, scope:loans, feeds_surplus:true}` (HR-1 versioned)
- **Prerequisites**: US-100, US-008
- **Journey/Process**: P4 schedule gen (admin) / P5 cron (mora)
- **Screens**: n/a

### US-102 — System accrues a mora fee on overdue installments (BR-17, flat_per_day)
- **As**: System (BR-17) | **Want to**: charge mora on overdue loan installments | **So that**: late repayment carries the agreed penalty and feeds the year-end surplus
- **AC**: extends US-038 — per overdue installment past `mora_threshold_days`, emit idempotent `LoanFee(fee_kind='mora')` (`UNIQUE(loan_id,fee_kind,accrued_on)`) computed from `config.mora` resolved **per accrual day** (`asOf=accrued_on`), `flat_per_day` = days_overdue × `per_day_amount`, bounded by `config.mora.cap` (default `overdue_installment`); stamps `group_config_version`; `scope=loans` (savings excluded); replay-safe; A6 alert unchanged
- **Prerequisites**: US-101, US-038
- **Journey/Process**: S3/S4 cron; P5
- **Screens**: n/a (cron)

### US-103 — Mora fee shown in loan detail, repayment split, and A/R aging
- **As**: La Tesorera | **Want to**: see accrued mora per loan and per overdue member | **So that**: I can communicate and collect it transparently
- **AC**: `SCR-loan-detail` Cronograma/Pagos surface accrued mora (`LoanFee` mora rows) + repayment applies mora alongside interest-first; `SCR-ar-aging` adds a mora column reconciling with `CxCobrar` reality; es-EC copy ("Mora", "Por día")
- **Prerequisites**: US-102
- **Journey/Process**: S4 collections
- **Screens**: SCR-loan-detail, SCR-ar-aging

### US-104 — Treasurer configures + waives mora (group-config + condonación, O5)
- **As**: La Tesorera | **Want to**: set this group's mora rule and forgive a charge when justified | **So that**: the penalty fits our group and hardship is handled fairly + auditably
- **AC**: group-config (`SCR-group-config` / `/admin/orgs/[id]/config`) exposes `config.mora` (mechanic, per_day_amount, cap kind/value, day_count, scope, feeds_surplus) with validation (e.g. `cap.kind` needs `value` when not `overdue_installment`/`none`; `day_count=business` rejected until holiday calendar) — saving writes a new `GroupConfig` version (HR-1); a waiver creates a reversal `LoanFee` (`reverses_id` + required `reverse_reason`), audit-logged (treasurer discretion)
- **Prerequisites**: US-101, US-102
- **Journey/Process**: S1 group rules; S4 collections
- **Screens**: SCR-group-config, SCR-loan-detail

### US-105 — System writes the immutable year-end balance snapshot at close (CHG-003)
- **As**: System (BR-18) | **Want to**: capture the group + per-member closing balances at the year-end close | **So that**: the year is preserved, queryable later, and the next year's surplus has a `cxc_anterior` source
- **AC**: post-commit of `PeriodClose(is_year_end)`, `SnapshotYearEnd` writes one `YearEndBalanceSnapshot` (+ per-member `YearEndBalanceSnapshotLine`) idempotent on `(org_id, year)`; totals (ahorros, cuota acumulada, préstamos por cobrar, interés por cobrar, banco) + `cxc_anterior` + frozen `group_config_version` + canonical-JSON SHA-256 hash; tables are immutable (no UPDATE/DELETE); a correction is a new canonical cut
- **Prerequisites**: US-046, US-101
- **Journey/Process**: S5 year-end close; P-new SnapshotYearEnd
- **Screens**: n/a (process)

### US-106 — Point-in-time balance query (any date)
- **As**: La Tesorera / auditor | **Want to**: see a member's (and the group's) balance as of any past date | **So that**: balances are auditable without a per-year reseed
- **AC**: a derived query/MV computes balances as of an arbitrary date from the append-only ledger; the balance as of 31/dic equals the `YearEndBalanceSnapshotLine`; surfaced as a date affordance on `SCR-member-detail` / `SCR-statements-archive`
- **Prerequisites**: US-105
- **Journey/Process**: S6 statements
- **Screens**: SCR-member-detail, SCR-statements-archive

### US-107 — Year-end snapshot PDF (kind=year_end_snapshot) archived + verifiable
- **As**: System | **Want to**: generate + archive the immutable year-end snapshot PDF | **So that**: the cut is shareable + publicly verifiable like other statements
- **AC**: `GenerateMemberStatement`/snapshot path emits a `StatementArchive` `kind=year_end_snapshot` (canonical-JSON hash), linked from `YearEndBalanceSnapshot.statement_archive_id`; hash seeded into the public-verify catalog (US-085)
- **Prerequisites**: US-105, US-086
- **Journey/Process**: S6; P15
- **Screens**: SCR-statements-archive, SCR-public-verify-pdf

### US-108 — Period/method-freeze guard at year-end (BR-09 / BR-18)
- **As**: System | **Want to**: freeze the savings method + GroupConfig version for a closed period | **So that**: a closed year's computations never change retroactively (changeable only for the next period)
- **AC**: at `PeriodClose(is_year_end)`, the snapshot + share-out stamp the `group_config_version` in force; a later GroupConfig edit applies only to the next period; reads for the closed period resolve the frozen version
- **Prerequisites**: US-046, US-100
- **Journey/Process**: S5 close
- **Screens**: n/a

### US-109 — Seed the 2025 (+ partial 2026) historical snapshot (O6)
- **As**: Operator/System | **Want to**: import the 2025 year-end (and partial 2026) balances from the client workbook | **So that**: point-in-time queries + the balance sheet work for prior years and 2026's `cxc_anterior` is bootstrapped
- **AC**: a one-time idempotent importer writes the 2025 `YearEndBalanceSnapshot` + lines (and partial-2026 data we have) from the client data; first-year `prior_snapshot_id` NULL; re-run is a no-op
- **Prerequisites**: US-105
- **Journey/Process**: brownfield seed
- **Screens**: n/a

### US-039 — System fires referral commission credit on Loan.status = pagado
- **As**: System (BR-06) | **Want to**: credit the referrer when the loan is fully paid | **So that**: BR-06 is honored deterministically
- **AC**: post-commit hook on `Loan.status` transition to `pagado`: if `referrer_member_id` is set and `LoanReferral.accrued_at` is null, INSERTs `Withdrawal` with `kind = referral_commission_credit`, sets `LoanReferral.accrued_at` + `withdrawal_id`; audit log entry; emits "Préstamo de {borrower} pagado — comisión de {currency} {amount} acreditada a {referrer}" alert (low severity, informational)
- **Prerequisites**: US-035, US-036
- **Info needed**: Loan + LoanReferral + GroupConfig.referral_commission_amount (stamped at origination)
- **Journey/Process**: S3 payoff; P22 AccrueReferralCommissionOnPayoff
- **Screens**: n/a (post-commit)
- **Gap callout**: NEW per BR-06

---

## Epic 5 — Collections + Liquidity (FEAT-040..FEAT-043, FEAT-054)

### US-040 — Treasurer views the A/R aging primary tab sorted by days-late descending
- **As**: Treasurer | **Want to**: see who owes what with the right priority | **So that**: I chase by data not mood
- **AC**: `/atrasos` shows live A/R aging from `mv_ar_aging`; rows: member, reason (aporte or loan), amount, days late, last action; sortable; filter by reason kind; updates real-time on any write
- **Prerequisites**: US-008, US-029, US-036
- **Info needed**: `mv_ar_aging` derived
- **Journey/Process**: S4 step 1 TO-BE; P8 RecomputeARAging
- **Screens**: SCR-ar-aging

### US-041 — Treasurer marks a promise on a late row with a date
- **As**: Treasurer | **Want to**: track what was promised | **So that**: I follow up at the right time without remembering
- **AC**: from SCR-ar-aging row, action "Marcar promesa" → date picker default = today + 7 days + optional note; INSERTs a `Promise` entity (or extends Alert with kind `promise_marked`) tied to (member, loan_id or cycle_id); system surfaces a reminder alert on that date
- **Prerequisites**: US-040
- **Info needed**: late row context + promise date
- **Journey/Process**: S4 TO-BE step 4-5; P17 EmitAlert variant
- **Screens**: SCR-ar-aging (inline action + modal)
- **Gap callout**: REQUIRES NEW ENTITY `Promise` (or extension to Alert). Confirm at design partner walkthrough.

### US-042 — Treasurer shares a chase message via WhatsApp from a late row
- **As**: Treasurer | **Want to**: send a warm but firm chase message in 1 tap | **So that**: I don't have to draft the wording each time
- **AC**: from SCR-ar-aging row, action "Avisar por WhatsApp" → opens WhatsApp share intent with pre-filled message in es-EC ("Hola {member}, te comparto que tu {aporte/cuota} de {period} aún está pendiente. ¿Cuándo crees poder hacerlo? — Mi Banquito.") + system records the share-attempt as an audit entry
- **Prerequisites**: US-040
- **Info needed**: member name + WhatsApp number + period + amount + template
- **Journey/Process**: S4 step 2 TO-BE; pattern.share-via-whatsapp
- **Screens**: SCR-ar-aging

### US-043 — System surfaces promise on the promised date as a reminder
- **As**: System | **Want to**: remind the treasurer on the day a promise was made | **So that**: she doesn't have to remember
- **AC**: nightly cron checks open promises with date ≤ today; emits an Alert; the alert in the bell at home; tappable to the underlying member / loan / cycle
- **Prerequisites**: US-041
- **Journey/Process**: S4; P17

### US-054 — Treasurer views Liquidez Proyectada single-screen with sandbox
- **As**: Treasurer | **Want to**: see if my group can sustain new loans + year-end share-out | **So that**: I avoid liquidity surprises
- **AC**: `/liquidez` shows 12-month projection line chart (calm Azul Cuenta), narrative summary in es-EC ("Tu mes mínimo es noviembre con USD X. Llegarás a fin de año con USD Y, lo cual está USD Z {por debajo|por encima} del compromiso."), available-capital figure prominent (= pool - base fund); optional "Considerar un préstamo" sandbox input
- **Prerequisites**: US-008
- **Info needed**: `mv_liquidez_proyectada` + GroupConfig.year_end_share_out_formula + `mv_available_capital`
- **Journey/Process**: S4 TO-BE expansion; P9 ProjectCashFlow
- **Screens**: SCR-cash-flow-projection (extended with available capital + base fund subtraction visible)

---

## Epic 6 — Reconciliation + Monthly Close (FEAT-044..FEAT-047, FEAT-067)

### US-044 — Treasurer enters declared bank balance and sees discrepancy
- **As**: Treasurer | **Want to**: enter what my bank shows | **So that**: the system tells me if my books agree
- **AC**: SCR-monthly-close step 1: large numeric input for declared balance; on submit, computes `pool_balance` derived view; displays both + discrepancy with green/amber/red text-and-bg; if within tolerance, "Cerrar el mes" CTA enabled; if outside, requires resolution or annotation
- **Prerequisites**: US-008, US-029, US-036
- **Info needed**: declared balance, computed pool, tolerance from GroupConfig, prior period close (if any)
- **Journey/Process**: S5 step 2-3 TO-BE; P12 ExecuteReconciliation
- **Screens**: SCR-monthly-close

### US-045 — Treasurer annotates a discrepancy outside tolerance with required reason
- **As**: Treasurer | **Want to**: accept a known difference | **So that**: I can close the month with a documented explanation
- **AC**: SCR-monthly-close step 2 (if discrepancy > tolerance): treasurer can: (a) try to resolve by recording a missing/reverse transaction (returns to S2 flow), or (b) annotate with reason ≥ 10 chars; if annotated, `ReconciliationCycle.resolution_kind = annotated_acceptance` + `resolution_note` set
- **Prerequisites**: US-044
- **Info needed**: reason text
- **Screens**: SCR-monthly-close (annotation modal)

### US-046 — Treasurer locks the monthly close and the period becomes immutable
- **As**: Treasurer | **Want to**: confirm the close | **So that**: the period is locked and no further entries can land in it
- **AC**: SCR-monthly-close confirm action writes `PeriodClose` row; period-lock trigger applies on next write attempt against ledger entries with `dated_on ≤ closed_at::date`; success copy "Mayo cerrado. Reconciliación: cero discrepancia." (or annotation summary)
- **Prerequisites**: US-044 or US-045
- **Info needed**: reconciliation_cycle_id
- **Journey/Process**: S5 step 5; P13 LockPeriodClose
- **Screens**: SCR-monthly-close

### US-047 — System generates the monthly close PDF with canonical-JSON SHA-256 hash
- **As**: System (P14) | **Want to**: produce a defensible artifact | **So that**: the president can read it on WhatsApp
- **AC**: post-commit on PeriodClose: `@react-pdf/renderer` generates monthly_close PDF using design tokens + branding logo + canonical JSON of payload; SHA-256 over canonical JSON written; PDF uploaded to Vercel Blob; `StatementArchive` row inserted; treasurer can preview and share via WhatsApp
- **Prerequisites**: US-046
- **Info needed**: PeriodClose, ReconciliationCycle, ledger entries for cycle, all member balances at close, all open loans, branding
- **Journey/Process**: S5/S6; P14 GenerateMonthlyCloseReport
- **Screens**: SCR-monthly-close (preview), SCR-statements-archive

---

## Epic 7 — Statement Distribution (FEAT-048..FEAT-050, FEAT-059)

### US-048 — Treasurer generates per-member statements as a batch and individually
- **As**: Treasurer | **Want to**: produce statements after close | **So that**: members get their proof
- **AC**: SCR-statements-archive after close shows "Generar estados de cuenta de mayo" CTA; batch generates 1 PDF per active member using `@react-pdf/renderer` with canonical JSON + hash; per-member preview available; on-demand individual generation also available from member-detail
- **Prerequisites**: US-046, US-047 (PDF infra exists)
- **Info needed**: each member's contributions + withdrawals + balance for the period; branding
- **Journey/Process**: S6 step 1-3 TO-BE; P15 GenerateMemberStatement
- **Screens**: SCR-statements-archive, SCR-member-detail

### US-049 — Treasurer shares a statement via WhatsApp share intent
- **As**: Treasurer | **Want to**: send a member their statement in 1 tap | **So that**: WhatsApp is the channel and the system makes it frictionless
- **AC**: from statements list, per-row "Compartir por WhatsApp" → opens WhatsApp share intent with the PDF; system records the share-attempt as an audit entry
- **Prerequisites**: US-048
- **Info needed**: member WhatsApp number + PDF blob URL
- **Journey/Process**: S6 step 2; pattern.share-via-whatsapp
- **Screens**: SCR-statements-archive

### US-050 — System awards treasurer compensation per cron with idempotency
- **As**: System (BR-07) | **Want to**: pay the treasurer on cadence | **So that**: BR-07 is honored deterministically
- **AC**: `/api/cron/award-treasurer-compensation` daily; for each org with `treasurer_compensation.next_due_on ≤ today`, writes `TreasurerCompensationDisbursement` + `Withdrawal` of `kind = treasurer_compensation_disbursement` (idempotent on (org_id, period_label) UNIQUE); audit log; surfaces a low-severity alert "Compensación de tesorera de {period} acreditada — {currency} {amount}"
- **Prerequisites**: US-012, US-017
- **Info needed**: GroupConfig.treasurer_compensation (kind, amount, period, next_due_on), treasurer member id
- **Journey/Process**: cron; P23 AwardTreasurerCompensation
- **Screens**: n/a (cron); visible on SCR-history and monthly close PDF
- **Gap callout**: NEW per BR-07

### US-059 — Member receives a statement via WhatsApp from treasurer
- **As**: Member (P03, artifact-only) | **Want to**: receive my statement on WhatsApp | **So that**: I have proof of my balance
- **AC**: this is achieved via US-049 (treasurer-driven); member behavior is to open the PDF preview in WhatsApp; no app login R1
- **Prerequisites**: US-049
- **Journey/Process**: S6 mini-journey
- **Screens**: n/a (WhatsApp PDF preview is the surface)

### US-060 — President receives the monthly close PDF via WhatsApp from treasurer
- **As**: President (P02, artifact-only) | **Want to**: receive the monthly close PDF before the meeting | **So that**: I walk in informed
- **AC**: this is achieved via the share-intent from SCR-monthly-close preview; no app login R1
- **Prerequisites**: US-047
- **Journey/Process**: S5/S6 mini-journey

---

## Epic 8 — Year-End Share-Out (FEAT-051..FEAT-053)

### US-051 — Treasurer runs the TWO-POOL year-end share-out wizard (rewritten, CHG-004)
- **As**: Treasurer | **Want to**: see each member's share computed transparently across the loan pool + savings pool | **So that**: I can defend the distribution at the year-end meeting
- **AC**: SCR-year-end-share-out wizard — **step 0 (Assembly governance)**: confirm/record the approved `SurplusGovernanceDecision` (`reparto_total`, `reserva_amount`, `reserva_disposition`; pool-split % from `config.distribution`); **step 1 group summary** (`:computed:` `distributable_surplus` = interest+solicitudes+mora − CxC_anterior; `loan_pool_amount`, `savings_pool_amount`, `alícuota_préstamos`, `alícuota_ahorros`); **step 2 per-member two-pool grid** (acumulado, saldo_ponderado_usd_dias, `loan_activity_basis` Σ(A+B principal repaid), `loan_bonus_c`, `savings_interest`, total_borrador, ajuste, total_final, motivo_ajuste); reads `mv_member_time_weighted_balance` + `mv_loan_activity_points` + `mv_distributable_surplus`
- **Prerequisites**: US-008, US-100, US-105, US-110, US-111, US-112, US-046
- **Info needed**: time-weighted balance per member; Σ(A+B) per member; distributable surplus; approved governance decision
- **Journey/Process**: S6 annual; `RunTwoPoolShareOut` (supersedes P16/P25 single-pool)
- **Screens**: SCR-year-end-share-out (two-pool rebuild)
- **Components**: `organism.year-end-share-out-editor` rebuilt with loan-bonus + savings-interest columns

### US-052 — Treasurer overrides a per-member share with required reason and audit (amended for two-pool)
- **As**: Treasurer | **Want to**: adjust a member's two-pool total when equity demands | **So that**: social rules complement the formula
- **AC**: SCR-year-end-share-out per-member row: ajuste numeric input (positive or negative) + motivo text required; updates `YearEndShareOutLine.override_share_amount` + `override_reason`; recomputes `final_share_amount` (over `loan_bonus_c + savings_interest`); **re-runs BR-22 exact reconciliation** (`Σ === reparto_total` via `ajuste`); audit log
- **Prerequisites**: US-051, US-113
- **Info needed**: YearEndShareOutLine + override + reason
- **Journey/Process**: S6 annual; BR-11 + BR-22

### US-053 — Treasurer approves the two-pool share-out → governance lock + payouts + year cut (rewritten, CHG-004)
- **As**: Treasurer | **Want to**: finalize the share-out | **So that**: payouts are recorded, the year is cut, and PDFs are produced
- **AC**: requires an `approved` `SurplusGovernanceDecision` (BR-20 pre-flight) + BR-22 exact reconciliation (`Σ final_share === reparto_total` with explicit `ajuste_amount`); "Aprobar reparto" confirmation modal; on approve: `YearEndShareOut.status = distributed` (+ governance `locked`); N `Withdrawal` rows `kind = year_end_share_out` (each linked to `YearEndShareOutLine.withdrawal_id`); **triggers `SnapshotYearEnd` (CHG-003 / BR-18)**; per-member + group-wide year-end PDFs; audit log; recomputes cash-flow projection. (Per-member withdraw/retain disposition is CHG-005.)
- **Prerequisites**: US-051, US-052, US-113, US-105
- **Info needed**: all YearEndShareOutLine rows with final amounts; approved governance decision
- **Journey/Process**: S6 annual; `RunTwoPoolShareOut` final + P15 + P14 + RecordWithdrawal × N + SnapshotYearEnd
- **Screens**: SCR-year-end-share-out final step

### US-110 — System computes the distributable surplus (BR-19, CHG-004)
- **As**: System (BR-19) | **Want to**: derive the year's distributable surplus | **So that**: the Assembly governs a correct figure
- **AC**: `ComputeSurplus` = `(interest gains + solicitudes/admin fees + mora) − CxC_anterior`; admin/mora fees with `LoanFee.feeds_surplus=true` are included (reconciles OQ-BR11-1); `CxC_anterior` from prior `YearEndBalanceSnapshot`; materialized as `mv_distributable_surplus`; golden file (2025 = 2487)
- **Prerequisites**: US-100, US-101, US-105
- **Journey/Process**: S6; ComputeSurplus
- **Screens**: n/a

### US-111 — Surplus governance: Assembly sets reparto vs reserva (BR-20, CHG-004)
- **As**: Treasurer (recording the Assembly) | **Want to**: set how much is distributed vs reserved, before the reparto | **So that**: the distribution reflects the group's decision, versioned + auditable
- **AC**: `SurplusGovernanceDecision` (year, version HR-1, `reparto_total`, `reserva_amount`, `reserva_disposition reserva|capital`, pool-split snapshot); revisable until `approved`; `RunTwoPoolShareOut` refuses to run without an approved decision (pre-flight gate, not a period-lock); `reserva_total + reparto ≤ distributable_surplus`; `capital` disposition joins the pool at next-year open
- **Prerequisites**: US-110
- **Journey/Process**: S6 Assembly; BR-20
- **Screens**: SCR-year-end-share-out (step 0 governance)

### US-112 — System computes the two-pool distribution (BR-21, CHG-004)
- **As**: System (BR-21) | **Want to**: split the reparto into a loan pool + savings pool and compute each member's share | **So that**: borrowers/guarantors and savers are both rewarded per the group's real model
- **AC**: `loan_pool = loan_pool_pct × reparto_total`; `savings_pool = savings_pool_pct × reparto_total`; `alícuota_préstamos = loan_pool ÷ Σ(A+B)`; `alícuota_ahorros = savings_pool ÷ Σ(USD-días)`; per member `loan_bonus_c = loan_activity_basis × alícuota_préstamos` + `savings_interest = time_weighted × alícuota_ahorros`; `loan_activity_basis = Σ(A+B)` = principal repaid own+guaranteed (O9); alícuotas snapshotted on `YearEndShareOut`; golden (ANGELITA 729×0.0231112=16.85)
- **Prerequisites**: US-111, US-114, US-009 (BR-09 time-weighted)
- **Journey/Process**: S6; RunTwoPoolShareOut
- **Screens**: n/a

### US-113 — Exact reconciliation with ajuste line (BR-22, CHG-004)
- **As**: System (BR-22) | **Want to**: guarantee Σ(shares) === reparto_total exactly | **So that**: the books always balance and trust holds
- **AC**: post-computation reconciliation: `Σ(final_share) === reparto_total` in `decimal(18,4)`; residue → explicit `YearEndShareOut.ajuste_amount` (never silently spread); gates approval; re-runs after any override (US-052); property test (no float intermediates)
- **Prerequisites**: US-112
- **Journey/Process**: S6; BR-22
- **Screens**: n/a

### US-114 — Derived data: loan-activity points + distributable-surplus views (CHG-004)
- **As**: System | **Want to**: materialize Σ(A+B) per member and the distributable surplus | **So that**: the two-pool engine reads stable, replayable inputs
- **AC**: `mv_loan_activity_points` (per member, per fiscal year = Σ principal repaid on own loans **A** + guaranteed non-member loans **B** via `LoanGuarantor` join — O9); `mv_distributable_surplus` (BR-19 inputs); refreshed at/after year-end close; period-locked version semantics
- **Prerequisites**: US-101, US-105
- **Journey/Process**: S6 derived layer
- **Screens**: n/a

### US-115 — Treasurer records each member's withdraw|retain disposition (CHG-005)
- **As**: Treasurer (per member) | **Want to**: record whether each socia takes her excedente as cash or leaves it in savings, with a motive | **So that**: the choice is transparent, audited, and tied to the bank movement
- **AC**: at share-out approval, per `YearEndShareOutLine`: set `disposition ∈ {withdraw, retain}` + **required** `disposition_motive`; **withdraw** → creates a `Withdrawal` (`kind=year_end_share_out`, `account_id` per CHG-001) linked via `withdrawal_id`; **retain** → creates a `Contribution` (savings credit) **dated at the credit date** linked via `retained_contribution_id` (joins next year's time-weighted base — O10); audit log; `Σ` dispositioned `=== reparto_total` (BR-22). No `Movement` entity — the bank leg is `Withdrawal.account_id`.
- **Prerequisites**: US-053, US-091, US-092
- **Info needed**: approved share-out lines; member accounts (CHG-001)
- **Journey/Process**: S6 annual; BR-23
- **Screens**: SCR-year-end-share-out

### US-116 — Account product-type + institution + Country/Institution reference seed (CHG-006)
- **As**: System / Operator | **Want to**: enrich accounts with product type + institution and seed the reference data | **So that**: accounts and reports are institution-aware
- **AC**: HR-25 timestamp-slug migration adds `Account.product_type {savings, checking}` + `Account.institution_id` (FK → Institution); creates `Country` + `Institution` reference tables; seeds `Country = Ecuador (USD)` + Institutions **Banco Pichincha, Banco Guayaquil, Banco Produbanco, Cooperativa Andalucía, Cooperativa 29 de Octubre**; reference data is admin-owned (NOT treasurer-editable); `SCR-accounts` surfaces product type + institution; `product_type`/`institution_id` NULL for `cash_box`/`treasurer_personal`
- **Prerequisites**: US-091
- **Info needed**: Account (CHG-001); the group's institution list
- **Journey/Process**: S1 setup / S7 accounts
- **Screens**: SCR-accounts

### US-117 — (R3+) Admin maintains Country/Institution reference data
- **As**: Platform Operator | **Want to**: add/edit countries + institutions | **So that**: new banks/coops onboard without a migration
- **Release**: R3+
- **AC**: (R3+) admin screens to CRUD `Country` + `Institution`; **deferred** — the data model + Ecuador seed land in US-116; no treasurer-facing surface
- **Prerequisites**: US-116
- **Journey/Process**: platform admin (R3+)
- **Screens**: (R3+ admin, not in R1)

### US-118 — BALANCE BANQUITO balance sheet + screen (CHG-007, GAP-4)
- **As**: Treasurer / President | **Want to**: see the year-end balance sheet (ACTIVOS = PASIVOS) | **So that**: the Assembly reads a credible `BALANCE BANQUITO al 31/dic`
- **AC**: `SCR-balance-banquito` (route `/balance`) renders ACTIVOS (préstamos por cobrar, intereses por cobrar, banco/caja) = PASIVOS/PATRIMONIO (ahorros, cuota anual acumulada, excedente del año = reparto + reserva); **derived** from `YearEndBalanceSnapshot` (CHG-003) + surplus (CHG-004); **BR-24 asserts ACTIVOS === PASIVOS**; export PDF (`StatementArchive kind=balance_banquito`) with verify-hash (US-085); nav-map route/node/edge/role-view + sidebar item `nav-balance` (HR-30)
- **Prerequisites**: US-105, US-110
- **Info needed**: year-end snapshot; surplus/reparto figures
- **Journey/Process**: S6; `GenerateBalanceBanquito`; BR-24
- **Screens**: SCR-balance-banquito

### US-119 — Year-end per-member economic summary (Saldo Económico, CHG-007)
- **As**: Treasurer | **Want to**: a per-member year summary (aportes semanales/anuales/préstamos) | **So that**: each socia sees her year at a glance
- **AC**: per-member year-end economic-summary PDF (`StatementArchive kind=year_end_economic_summary`): aportes semanales, aportes anuales, préstamos; verify-hash (US-085); listed + previewable in `SCR-statements-archive`
- **Prerequisites**: US-105, US-053
- **Journey/Process**: S6; P15
- **Screens**: SCR-statements-archive

### US-120 — Monthly group summary report (RESUMEN MENSUAL, CHG-007)
- **As**: Treasurer | **Want to**: a monthly group summary by rubro (inflows/outflows) | **So that**: month-to-month transparency
- **Release**: R2
- **AC**: (R2) monthly group-summary PDF (`StatementArchive kind=monthly_summary`) — inflows/outflows by rubro from the monthly close; verify-hash
- **Prerequisites**: US-046, US-047
- **Journey/Process**: S5/S6; report layer
- **Screens**: (R2 — report PDF, no R1 screen)

### US-121 — Identity + membership model: one treasurer manages many groups (CHG-008)
- **As**: System / Operator | **Want to**: decouple identity from a single org | **So that**: one treasurer manages several banquitos with one login
- **AC**: HR-25 timestamp-slug migration creates `UserAccount` + `UserOrgMembership` (`UNIQUE(user_id, org_id)`); **lifts the global UNIQUE on `Member.auth_subject`** (identity moves to `UserAccount`); **greenfield** — provision the treasurer's `UserAccount` + one `UserOrgMembership` per group at launch (no identity-merge migration; truth is the notebooks); grant/revoke versioned (HR-1)
- **Prerequisites**: US-008
- **Journey/Process**: platform identity
- **Screens**: n/a

### US-122 — Active-org session + middleware re-validation (BR-25, CHG-008)
- **As**: System | **Want to**: resolve + isolate the active group safely | **So that**: there is no cross-group data leakage
- **AC**: middleware sets `app.current_org` from the session-selected org **only after re-validating it ∈ the user's active `UserOrgMembership` set**; a non-member/revoked org is **rejected**; RLS unchanged; integration test "selecting a non-member org is rejected, RLS serves only the active group"
- **Prerequisites**: US-121
- **Journey/Process**: auth/session
- **Screens**: n/a

### US-123 — Group-switcher chip + active-group banner in the shell (consumes IMP-229)
- **As**: Treasurer | **Want to**: see and switch the active group from any screen | **So that**: I always know which group I'm working in
- **AC**: configure `app_shell.header.active_context` (enabled, icon, switch labels es/en, current group, member groups) — the **IMP-229** archetype renders the group-switcher chip (active group name + switch list) on **every** screen; switching sets the active group (US-122) and reloads scoped; single-group users see the name without a chooser
- **Prerequisites**: US-122, IMP-229
- **Journey/Process**: shell
- **Screens**: (shell — appears on all screens)

### US-124 — Group-picker landing (SCR-group-picker, CHG-008)
- **As**: Treasurer with >1 group | **Want to**: choose which group to manage after login | **So that**: I start in the right group; single-group users skip it
- **AC**: `SCR-group-picker` (route `/grupos`) lists the user's groups (name, role, last activity); selecting sets the active org (US-122) → redirect home; **auto-selected/skipped when exactly 1 group**; nav-map route/node/edge/role-view (NOT a sidebar destination)
- **Prerequisites**: US-122
- **Journey/Process**: login / switch entry-point
- **Screens**: SCR-group-picker

### US-125 — Onboard an additional group for an existing treasurer + switch audit (O13)
- **As**: Operator | **Want to**: provision a new group for an existing treasurer | **So that**: the mother's new banquitos appear under one login
- **AC**: operator provisions a new `Organization` + a `UserOrgMembership` for the existing `UserAccount`; the new group appears in the picker/switcher; the treasurer runs the per-group first-run setup wizard; a **"group switched"** event is audited (BR-25)
- **Prerequisites**: US-121, US-016, US-025
- **Journey/Process**: platform provisioning (operator-provisioned, O13)
- **Screens**: (operator provisioning; reuses the per-group first-run setup)

---

## Epic 9 — Alerts (FEAT-055, FEAT-061..FEAT-068)

### US-055 — Treasurer views and acts on the alerts bell with dismiss, snooze, and "Avisar"
- **As**: Treasurer | **Want to**: see proactive risk signals | **So that**: I act before they become crises
- **AC**: alert bell in `organism.app-header` with count badge; opens slide-out list; each alert: kind icon, Spanish copy with specific values, dismiss or snooze 7 days (where applicable per `03b §6`); critical alerts reappear until acted upon; from A2/A3/A6 row, "Avisar por WhatsApp" action with pre-filled copy
- **Prerequisites**: US-008
- **Info needed**: Alert[] for active org filtered by undismissed and not-snoozed
- **Journey/Process**: cross-cutting; P17 EmitAlert
- **Screens**: integrated into shell

### US-061 — System emits A1 *Conciliación del mes anterior pendiente* (High, treasurer)
- **AC**: cron checks day 5 of new cycle; if prior cycle has no `PeriodClose`, emits `Alert kind=A1 severity=high audience=treasurer dedup_window=24h` with Spanish copy: *"El mes de {prev_month} aún no está cerrado. Te recomiendo cerrar antes de la próxima reunión."*
- **Prerequisites**: US-008, US-012
- **Journey/Process**: cron + S5; P17 (kind A1)

### US-062 — System emits A2 *Préstamo próximo a vencer* (Medium, treasurer)
- **AC**: post-commit on `RecomputeARAging` (P8): for each loan with `LoanSchedule.due_on ≤ today + 7 days AND status = pendiente`, emits `kind=A2 severity=medium audience=treasurer dedup_window=24h` with copy: *"El préstamo de {member} vence en 7 días. Saldo actual: USD {outstanding}."*
- **Prerequisites**: US-040 (mv_ar_aging), US-008
- **Journey/Process**: S3/S4; P17 (kind A2)

### US-063 — System emits A3 *Aporte atrasado por > N días* (Medium, treasurer)
- **AC**: post-commit on `RecomputeMemberCompliance` (P7): when a member's state transitions to `atrasado` (per `GroupConfig.late_threshold_days`), emits `kind=A3 severity=medium audience=treasurer dedup_window=24h` with copy: *"El aporte de {month} de {member} está atrasado por {days} días."*
- **Prerequisites**: US-031, US-008
- **Journey/Process**: S2/S4; P17 (kind A3)

### US-064 — System emits A4 *Liquidez proyectada por debajo del margen* (High, treasurer)
- **AC**: post-commit on `ProjectCashFlow` (P9): if any monthly projection in the 12-month horizon falls below `GroupConfig.safety_margin_amount`, emits `kind=A4 severity=high audience=treasurer dedup_window=7d` with copy citing the specific month and shortfall.
- **Prerequisites**: US-054
- **Journey/Process**: cross-cutting; P17 (kind A4)

### US-065 — System emits A5 *Compromiso de reparto excede ingresos proyectados* (High, treasurer)
- **AC**: post-commit on `EvaluateYearEndCommitment` (P11): if projected year-end commitment (per BR-09 + BR-11) exceeds projected available capital, emits `kind=A5 severity=high audience=treasurer dedup_window=7d` with concrete Spanish copy citing the projected payout, available, and shortfall amounts; alert remains active until next P11 evaluation shows it resolved. **Connected to US-053 acceptance: when A5 active at approval time, year-end share-out approval requires explicit treasurer override with reason (per Review Pass F16).**
- **Prerequisites**: US-054, US-051
- **Journey/Process**: cross-cutting; P17 (kind A5)

### US-066 — System emits A6 *Préstamo en mora* (High, treasurer)
- **AC**: post-commit on `EvaluateLoanEligibility` (P10): when a loan transitions to `en_mora` (per `GroupConfig.mora_threshold_days`), emits `kind=A6 severity=high audience=treasurer dedup_window=24h` with copy: *"El préstamo de {member} entró en mora ({n} cuotas vencidas)."* When borrower is non-member (per BR-05), copy mentions the guarantor: *"El préstamo de {non-member} entró en mora — garante: {member}."*
- **Prerequisites**: US-033, US-034, US-040
- **Journey/Process**: S3/S4; P17 (kind A6)

### US-067 — System emits A7 *Discrepancia bancaria detectada* (Critical, treasurer)
- **AC**: on `ReconciliationCycle` write with discrepancy > tolerance, emits `kind=A7 severity=critical audience=treasurer dedup_window=per_cycle` with copy citing both balances and the difference. Alert remains until resolved or until close completes with annotation. Reappears next session until acted upon (Critical class).
- **Prerequisites**: US-044
- **Journey/Process**: S5; P17 (kind A7)

### US-068 — System emits A14 *Saldo de miembro negativo* (Critical, treasurer)
- **AC**: post-event on `RecomputeMemberCompliance` (P7): if any member balance computes < 0 (data-integrity violation — should not happen), emits `kind=A14 severity=critical audience=treasurer dedup_window=immediate` with copy: *"El saldo de {member} quedó en negativo (USD {amount}). Esto no debería pasar — por favor revisa."* Also alerts platform operator via NFR-OBS-01.
- **Prerequisites**: US-031
- **Journey/Process**: cross-cutting; P17 (kind A14)

> **Note on A8/A12/A13 (operator-side alerts) and A10 (decision, not alert).** The Verifier review (F2) flagged A8–A13 as uncovered. Closer inspection of `03b §6` shows: **A10** *"Préstamo solicitado supera capital disponible"* is a **decision-not-alert** — already covered in-flow by US-033/US-034 eligibility pre-flight rejection copy. **A12** *"Operator-only — drift fail on substrate"* is surfaced by US-023 (drift status badge) + US-081 (cron run history). **A13** *"Operator-only — tenant inactive ≥ N days"* is surfaced by US-019 (per-org health snapshot). Only **A8**, **A9**, and **A11** genuinely require new emit stories — added as US-088/089/090 below.

### US-088 — System emits A8 *Período no cerrado en últimos N días* (Medium, treasurer + platform operator)
- **AC**: daily cron checks each org: if `today - latest PeriodClose.closed_at > GroupConfig.close_overdue_threshold_days` (default 14), emits `kind=A8 severity=medium audience=both dedup_window=24h`. Treasurer-side copy: *"No has cerrado el mes en los últimos {n} días."* Operator-side row on `/admin` per-org snapshot: *"Org {id} — no monthly close in {n} days."*
- **Prerequisites**: US-008, US-012, US-019
- **Journey/Process**: cron; P17 (kind A8)
- **Addresses**: Verifier F2 (partial)

### US-089 — System emits A9 *Cambio de configuración del grupo* (Low, treasurer)
- **AC**: post-commit on any new `GroupConfig` version (via HR-1 EntityVersion): emits `kind=A9 severity=low audience=treasurer dedup_window=none` with copy specific to which field changed. Example for rate change: *"Cambiaste la tasa de interés de {old}% a {new}%. Préstamos nuevos usarán la nueva tasa; los existentes mantienen la anterior (per OQ-BR2-1)."*
- **Prerequisites**: US-028, US-017
- **Journey/Process**: cross-cutting; P17 (kind A9)
- **Addresses**: Verifier F2

### US-090 — System emits A11 *Aporte sin foto de comprobante (≥ N consecutivos)* (Low, treasurer)
- **AC**: post-commit on `RecordContribution` (P1): for each member, if the last N contributions (default 3) have `slip_photo_id IS NULL`, emits `kind=A11 severity=low audience=treasurer dedup_window=7d` with copy: *"Los últimos {n} aportes de {member} no tienen foto adjunta. Considera pedirla para mantener el respaldo."*
- **Prerequisites**: US-029, US-008
- **Journey/Process**: S2; P17 (kind A11)
- **Addresses**: Verifier F2

---

## Epic 10 — Historial + Audit (FEAT-056, FEAT-057)

### US-056 — Treasurer views Historial as plain-Spanish audit narration
- **As**: Treasurer | **Want to**: see what happened in plain Spanish | **So that**: I can defend any number to a member
- **AC**: `/historial` lists every audit entry rendered as Spanish narration ("12 de mayo, 14:23 — Registraste un aporte de María por USD 50.") sortable by date desc; per row, link to underlying entity if applicable; export to PDF available
- **Prerequisites**: US-008
- **Info needed**: AuditLogEntry rows mapped via `action_kind` to Spanish copy templates
- **Journey/Process**: cross-cutting; P18 PlatformAuditWrite
- **Screens**: SCR-history

### US-057 — Treasurer searches Historial by member, kind, date range
- **As**: Treasurer | **Want to**: investigate a specific question | **So that**: dispute resolution is fast
- **AC**: SCR-history filters: member (autocomplete), action kind (dropdown of human-readable categories), date range; URL state syncs filters for shareability
- **Prerequisites**: US-056
- **Screens**: SCR-history

---

## Epic 11 — Substrate Enforcement + Observability (FEAT-069..FEAT-073)

### US-069 — System enforces append-only ledger via Postgres row triggers
- **As**: System | **Want to**: reject any UPDATE/DELETE on 5 ledger tables | **So that**: NFR-SEC-02 holds
- **AC**: triggers on `Contribution, Withdrawal, Repayment, Expense, InterestAccrual` raise `append_only_violation` on UPDATE/DELETE; integration test verifies; documented in migration
- **Prerequisites**: US-008
- **Journey/Process**: NFR-SEC-02

### US-070 — System enforces period-lock immutability via Postgres row trigger
- **As**: System | **Want to**: reject inserts into a locked period | **So that**: NFR-SEC-03 holds
- **AC**: trigger on ledger tables checks `dated_on` against last `PeriodClose.closed_at::date` for same cycle and rejects; integration test verifies; documented
- **Prerequisites**: US-008
- **Journey/Process**: NFR-SEC-03

### US-071 — System enforces audit-write-failure rollback via same-transaction pattern
- **As**: System | **Want to**: roll back originating action if audit fails | **So that**: NFR-SEC-04 holds
- **AC**: every Server Action that writes wraps the write + `INSERT AuditLogEntry` in one `db.transaction()`; integration test verifies that an injected audit-table failure rolls back the originating row
- **Prerequisites**: US-008
- **Journey/Process**: NFR-SEC-04

### US-072 — System enforces cross-tenant safety via Postgres RLS + auth session var
- **As**: System | **Want to**: reject any query that doesn't carry the correct org_id | **So that**: NFR-SEC-01 holds even when an app-layer predicate is forgotten
- **AC**: RLS policies on every tenant table; integration test creates two orgs and verifies queries from org-A session cannot see org-B rows; documented; CI gates
- **Prerequisites**: US-008, US-011
- **Journey/Process**: NFR-SEC-01

### US-073 — System captures errors with PII redaction in Sentry within 1 minute
- **As**: System | **Want to**: visibility of errors without leaking PII | **So that**: NFR-OBS-01 and PII-handling baseline hold
- **AC**: Sentry init with `beforeSend` hook that redacts `whatsapp_number`, masks email domain, redacts `display_name` from breadcrumbs and event payloads; unit test of redaction config; documented
- **Prerequisites**: US-005

---

# Coverage and Gap Summary

- **67 explicit US-NNN blocks** in the draft (SEC0 claimed 73 because US-061..068 collapsed 8 alert-emit stories into one block). After the Review Pass below adds 14 new stories (US-074..087), the final inventory is **81 stories** across **14 epics** (Epic 14 added for the new artifact-trust + recovery work). The original draft's claim of "73" applied to the *draft*; the annex below reconciles the count.
- **Epic 0 (Infra)** is new — 15 stories needed before any feature work.
- **5 BR-driven additions** that introduce new screens/components beyond `06_design_system.md`'s original 23 screens: US-024 (admin business-rules panel), US-032 (base-fund quota recording), US-034 (non-member loan with guarantor), US-035 (referrer designation in originate-loan), US-051 (extended year-end wizard with by-source breakdown).
- **2 new entities** introduced beyond the originally-planned 22 ER entities and even beyond the 7 added by `09b §6`: a candidate `Promise` entity (US-041) — to be confirmed with design partner whether to model as standalone or extend Alert.
- **Persona coverage complete** — every persona's R1 journey has at least one user story.
- **All 11 business rules from `09b`** have corresponding user stories: BR-01 → US-033/US-036, BR-02 → US-028/US-033, BR-03 → US-033, BR-04 → US-033/US-034, BR-05 → US-034, BR-06 → US-035/US-039, BR-07 → US-050, BR-08 → US-017/US-032, BR-09 → US-051, BR-10 → US-017, BR-11 → US-051/US-052.
- **All 14 alert kinds from `03b §6`** have corresponding emit stories.
- **All NFRs are covered** as either explicit stories (US-069..073 for security NFRs) or implicit acceptance criteria across the feature stories (performance, accessibility, internationalization, PWA).

---

# Review Pass — 2026-05-28 (multi-agent review)

> The draft scope above (~67 stories) was reviewed in parallel by six perspectives — Principal Solution Architect, Product Owner + Business Analyst pair, four persona simulators (La Tesorera P01, El Presidente P02 + El Miembro/a P03 combined, La Operadora P04), and a Business-Rules + Entities forensic verifier. The reviews surfaced **62 distinct findings** consolidated below. The most consequential findings drive **14 new user stories (US-074..087)** added to the inventory; the remaining findings are documented as **AC tightening to apply during Step 10b** when stories become per-file specs.

## A. Consolidated Findings Index

| Tag | Severity | Surfaced by | Title |
|---|---|---|---|
| F1 | HIGH | Verifier | P21..P25 referenced in scope but missing from `03b_service_blueprint.md` process catalogue (stops at P20). Substrate inconsistency — 03b needs the deltas applied per `09b §6` hand-off (deferred until 03b regenerates) |
| F2 | HIGH | Architect, Verifier, PO/BA | Alerts A8..A13 referenced in US-061..068 title but only A1-A7+A14 actually enumerated. Split into 14 explicit stories OR explicitly defer A8-A13 with rationale |
| F3 | CRITICAL | Treasurer, PO/BA | **Cash-vs-bank money flow not modeled.** Treasurer collects aportes in cash at meetings; gives loans in cash from petty cash; bank is only one of multiple "places where the money lives." Without this, the reconciliation premise breaks immediately — addressed by US-074 |
| F4 | CRITICAL | Treasurer | **Partial aporte (`parcial`) state not modeled.** Half this month, the other half next. Addressed by US-075 |
| F5 | CRITICAL | Treasurer | **Promise tracking missing.** Marked as a sub-bullet of US-041 but never given a real story; promise + reminder + outcome log are first-class. Addressed by US-078 (Alert-extension pattern per Architect N3) |
| F6 | CRITICAL | Treasurer, PO/BA | **PWA offline-write visible state missing.** No AC for "saved offline, syncs when signal returns" — treasurer will duplicate every entry under 3G. Addressed by US-077 |
| F7 | CRITICAL | Treasurer | **Loan disbursement source not specified** (cash from petty cash vs bank transfer). Addressed by US-076 |
| F8 | CRITICAL | PO/BA | **US-053 year-end share-out approval has no undo.** Highest-stakes write in the system; grace-window reversal needed. Addressed by US-084 |
| F9 | CRITICAL | Architect | **NFR-SEC-04 audit-write-failure rollback not in feature ACs.** Cross-cutting AC clause applied to every write story (Step 10b template) |
| F10 | CRITICAL | Architect | **US-039 referral commission post-commit missing idempotency.** AC tightening — add UNIQUE constraint on `(loan_id)` for `referral_commission_credit` Withdrawal |
| F11 | CRITICAL | Architect, PO/BA, Treasurer | **Period-lock pre-flight missing from write stories + no re-open / adjustment-period story.** Treasurer fears locking; operator may need to assist. Addressed by US-083 |
| F12 | CRITICAL | Architect, Operator | **OQ-ARCH-2 Auth0 Organizations free-tier is a gate, not a side note.** US-011 design bifurcates until US-004 resolves. AC update on US-004 + add fallback path |
| F13 | CRITICAL | Architect | **NFR-PWA-02 offline read test missing from US-010.** AC update — add integration test for offline shell + cached views |
| F14 | CRITICAL | Architect, Verifier | **US-034 missing `LoanFee` write AC + P21 not cited in US-033 Journey/Process.** AC tightening per Step 10b |
| F15 | CRITICAL | PO/BA | **Brief success metrics G2/G3/G4 not in any AC.** Add measurable AC to US-046 (< 30 min), US-016/017/018 (< 1 day), and `/admin` snapshot (zero discrepancy 3 months). Step 10b |
| F16 | CRITICAL | PO/BA, Architect | **US-053 year-end approval has no A5 (shortfall) gate.** Treasurer could approve a share-out the bank can't honor. AC tightening |
| F17 | CRITICAL | PO/BA | **US-033/034 eligibility rejections not enumerated.** Must reject `en_pausa`/`baja` borrower, guarantor in default, fiscal-year freeze near share-out. AC tightening |
| F18 | CRITICAL | Operator | **FcoStudios platform-org bootstrap story missing.** Who seeds the first operator's `auth_subject`? Addressed by US-079 |
| F19 | CRITICAL | Operator | **Freeze/archive tenant story missing.** US-016 only covers create. Addressed by US-080 |
| F20 | CRITICAL | Operator, PO/BA | **Cron failure recovery UI missing.** `/admin/cron-runs` + manual replay surface. Addressed by US-081 |
| F21 | CRITICAL | President + Member | **Monthly close PDF (US-047) needs per-member month-net summary + loans-due roster + active-alerts snapshot + annotated discrepancy.** Without these, president cannot defend the close at the meeting. AC tightening + addressed by US-086 enriched PDF spec |
| F22 | CRITICAL | President + Member | **Per-member statement (US-048) needs opening balance + month-over-month + SlipPhoto reference per row.** Brand spec says "bank-statement credible"; current AC ships month-only with no opening balance. AC tightening |
| F23 | CRITICAL | President + Member | **Year-end per-member PDF (US-053) must explain time-weighted math (Sandra case).** Without an in-PDF explanation, members will dispute the counter-intuitive result. Addressed by US-086 |
| F24 | CRITICAL | President + Member | **Integrity hash needs verifier affordance (QR / URL).** Hash without affordance is decorative. Addressed by US-085 (public PDF verifier endpoint) |
| F25 | IMPORTANT | Architect, PO/BA | US-008 megalith — 29 tables + RLS + triggers + materialized views in one story. Decompose into US-008a (schema + RLS), US-008b (triggers + audit pattern), US-008c (materialized views), US-008d (drift-check migration tests). Step 10b decomposition |
| F26 | IMPORTANT | Architect, PO/BA | NFR-PERF latency not in any feature AC. Add to US-029, 033, 036, 047, 051, 058. Step 10b |
| F27 | IMPORTANT | Architect | NFR-BR-01 `group_config_version_at_origination` stamp missing from US-032, 050, 053. Step 10b |
| F28 | IMPORTANT | Architect | US-047/053 PDF idempotency not stated (UPSERT on natural key). Step 10b |
| F29 | IMPORTANT | Architect | US-016/018 Auth0 + DB writes not idempotent (saga or two-phase). Step 10b |
| F30 | IMPORTANT | Architect, Operator | US-020 impersonation needs hardening: start audit + cookie binding + auto-timeout + kill-switch + "all current impersonations" admin view. Step 10b |
| F31 | IMPORTANT | Architect | US-031 vague on refresh timing (specify "same post-commit hook as contribution + SWR revalidation"). Step 10b |
| F32 | IMPORTANT | Architect, Verifier | P21..P25 not labeled in story Journey/Process metadata. Step 10b cleanup |
| F33 | IMPORTANT | Architect | US-073 redaction test scope too narrow (must test Server Action error paths with member names). Step 10b |
| F34 | IMPORTANT | PO/BA, Operator | US-017 megalith form (11 BRs in one) — split into US-017a (cycle + late/mora), US-017b (loan engine BR-01..06), US-017c (treasurer comp + base fund BR-07/08), US-017d (fiscal year + share-out + reconciliation BR-09/10/11). Step 10b |
| F35 | IMPORTANT | PO/BA | US-027 status change has no undo + no downstream baja-loan guard. Step 10b |
| F36 | IMPORTANT | PO/BA | US-015 magic-link failure recovery missing. Addressed by US-082 |
| F37 | IMPORTANT | Operator | Local Docker Postgres parity gap (only Neon-branching for previews). Add to US-006 AC. Step 10b |
| F38 | IMPORTANT | Operator | Secrets rotation runbook missing. Operational runbook R-7. Step 10b |
| F39 | IMPORTANT | Operator | Cross-org member search + forensic ledger-tree view missing from admin slice. R2 expansion |
| F40 | IMPORTANT | Operator | Design-partner-specific onboarding ceremony missing (bi-weekly observation log, vocabulary-test fixture, manual parity check). Addressed by US-087 |
| F41 | IMPORTANT | PO/BA | US-025 wizard resume mechanism vague. Step 10b |
| F42 | IMPORTANT | PO/BA | US-030 reversal of locked-period contribution must be rejected with adjustment-entry guidance. Step 10b (works with US-083) |
| F43 | IMPORTANT | PO/BA, Operator | US-021 ZIP integrity hash missing. Step 10b |
| F44 | IMPORTANT | Operator | Partial data export (single fiscal year / member range) missing. R2 |
| F45 | NICE | Architect | US-019 `bypass_org_rls = true` flag should be stated explicitly in AC. Step 10b |
| F46 | IMPORTANT | Treasurer | Member admin missing cédula + emergency contact fields. AC update on US-026. Step 10b |
| F47 | IMPORTANT | Treasurer | Loan repayment AC silent on overpayment / underpayment / multi-cuotas. Step 10b |
| F48 | IMPORTANT | Treasurer | Quick-undo (30-sec last-action undo) missing — formal reversal feels exaggerated for a misclick. Add UX pattern: 30-second toast "Deshacer" before commit becomes permanent. Step 10b + design system addition |
| F49 | IMPORTANT | Treasurer | Promise WhatsApp message must be editable before sending. AC update on US-042 |
| F50 | NICE | Treasurer | Vocabulary toggle per group (`socia` vs `aportante`) should be configurable. Add to `GroupConfig.member_label_kind`. R2 / OQ for design-partner |
| F51 | NICE | Treasurer | "Liquidez Proyectada" terminology too "banky" — consider "Cómo va la plata del grupo" or similar. Design-partner walkthrough decision |
| F52 | CRITICAL | Treasurer | Time-weighted concept needs in-UI plain-Spanish explanation (3 lines) — supports BR-09 Sandra-case understanding. Addressed by US-086 (per-member PDF math explanation) + extend US-051 wizard AC |
| F53 | IMPORTANT | Verifier | OQ-BR9-1 ("quota does NOT earn interest") is implicit only in US-051. Add explicit AC clause to US-051 + view definition. Step 10b |
| F54 | LOW | Verifier | P21 (ChargeAdminFee) not explicitly cited in US-033 Journey/Process line. Step 10b cleanup |
| F55 | LOW | Verifier | `referral_commission_currency` missing from US-017 AC inventory. Step 10b |
| F56 | R2 | PO/BA | Treasurer-side override of compensation cron (skip a month). R2 |
| F57 | R2 | PO/BA | Alert digest / daily summary. R2 |
| F58 | R2 | PO/BA | Mass-import members from existing Excel. R2 |
| F59 | OPERATIONAL | Operator | No peer-review for dangerous direct-DB ops (the IMP-206-class risk against mother's banquito). Mitigation: add `nous_trace.py` dangerous-op confirm hook + operator runbook discipline. Operational, not a story |
| F60 | META | PO/BA | Story count integrity (73 vs 67) — fixed at top of this annex |
| F61 | META | PO/BA | Uniform AC template (Trigger / Inputs / Server effect / DB write / MV refresh / Audit row / Visible copy / Failure mode). Apply during Step 10b per-story file authoring |
| F62 | META | PO/BA | `BRs Touched` field per story for traceability matrix. Apply during Step 10b |

---

## B. 14 New User Stories (US-074..087)

> Added per the consolidated findings above. Each maps to the finding(s) it addresses.

### Epic 14 — Money-Flow Realism + Trust Artifacts + Operator Recovery (NEW)

#### US-074 — Treasurer records a contribution as cash, bank, or petty cash
- **As**: Treasurer | **Want to**: declare WHERE the money came in (banco / efectivo en reunión / caja chica) | **So that**: the reconciliation flow knows what to reconcile against
- **AC**: extend SCR-record-contribution with `payment_source` field default `bank_transfer` + alternatives `cash_in_meeting` / `petty_cash_deposit`; if `cash_in_meeting`, slip photo not required; system tracks a virtual `petty_cash_balance` per org alongside `bank_balance`; reconciliation flow (US-044) handles BOTH balances separately
- **Prerequisites**: US-029, US-044
- **Info needed**: `payment_source` enum + `petty_cash_balance` derived view
- **Journey/Process**: S2 step 1-3 corrected
- **Screens**: SCR-record-contribution (extended), SCR-monthly-close (extended with petty cash row)
- **Addresses**: F3
- **Gap callout**: NEW — fundamental to AS-IS process realism

#### US-075 — System supports a "partial aporte" state and treasurer records partial payments
- **As**: Treasurer | **Want to**: record a member's partial monthly contribution | **So that**: the compliance state reflects "parcial" not "atrasado"
- **AC**: `Contribution.kind` enum extended with `partial`; `mv_member_compliance_state` returns `parcial` when `SUM(contributions) < expected_amount AND > 0`; status pill renders `parcial` per design system; member can complete in a later transaction without reversal
- **Prerequisites**: US-029, US-031
- **Journey/Process**: S2; P1 + P7 RecomputeMemberCompliance
- **Addresses**: F4

#### US-076 — Treasurer declares loan disbursement source (bank vs cash) at origination
- **As**: Treasurer | **Want to**: declare HOW I gave the loan to the borrower | **So that**: the pool/petty-cash balances match reality
- **AC**: extend SCR-originate-loan with `disbursement_source` field default `bank_transfer` + alternative `petty_cash`; on origination, system writes a virtual `LoanDisbursement` event tying the loan to the source; reconciliation flow uses this to verify bank-app data
- **Prerequisites**: US-033, US-074
- **Addresses**: F7

#### US-077 — PWA visibly shows "guardado, esperando señal" when a write is queued offline
- **As**: Treasurer | **Want to**: see clearly that my entry was saved offline | **So that**: I don't re-enter it and create duplicates when signal returns
- **AC**: service worker queues write with `client_request_id`; UI shows "Guardado. Se sincronizará cuando vuelva la señal" amber chip on the affected row; chip clears on successful sync; user can tap to see queued count; if sync conflict (server already accepted via `client_request_id` UNIQUE), no error — silent dedupe
- **Prerequisites**: US-010, US-029
- **Addresses**: F6

#### US-078 — Treasurer marks a chase-promise with date + receives a reminder
- **As**: Treasurer | **Want to**: mark "Lucía prometió pagar el viernes" and be reminded | **So that**: I don't have to remember
- **AC**: extend `Alert` with `kind = promise_marked`, `subject = (member, loan_or_cycle, promised_date, optional_amount)`; on the promised date, alert reappears with `severity = medium`; outcome resolved by recording a contribution/repayment OR explicit "no cumplió" annotation
- **Prerequisites**: US-040, US-041
- **Journey/Process**: S4; P17 EmitAlert (new kind)
- **Addresses**: F5

#### US-079 — Operator bootstraps the FcoStudios platform organization
- **As**: Operator | **Want to**: have the FcoStudios platform-org in place with my `auth_subject` linked | **So that**: I can sign in to /admin on day one
- **AC**: a one-time idempotent seed script in `packages/db/seed/platform-bootstrap.ts` creates: FcoStudios Auth0 Organization (or single-tenant fallback per OQ-ARCH-2), Francisco Lomas as `PlatformOperator` row, role grant; runs once at first deploy with manual confirmation
- **Prerequisites**: US-004, US-008
- **Addresses**: F18

#### US-080 — Operator freezes or archives a tenant organization with audit trail
- **As**: Operator | **Want to**: pause or archive a tenant org cleanly | **So that**: the org becomes read-only without data loss
- **AC**: `/admin/orgs/[id]/lifecycle` action; `freeze` sets `Organization.status = paused` (RLS reads still allowed; writes rejected); `archive` sets `status = archived` (paused + admin-export available + treasurer-login disabled); both require reason text; audit log
- **Prerequisites**: US-016
- **Journey/Process**: PA-S1 extended; comp_platform_ops_011
- **Screens**: SCR-admin-org-detail (lifecycle section)
- **Addresses**: F19

#### US-081 — Operator views cron run history and triggers manual replay
- **As**: Operator | **Want to**: see what happened on each cron run and replay if needed | **So that**: missed accruals or treasurer-comp are recoverable
- **AC**: `/admin/cron-runs` table per cron endpoint + per run (timestamp, duration, orgs processed, failures, summary); manual "Replay with from_date / to_date" button calls the cron route handler with bearer auth; results audited
- **Prerequisites**: US-012, US-038, US-050
- **Addresses**: F20

#### US-082 — Operator re-issues a magic-link from /admin when treasurer cannot log in
- **As**: Operator | **Want to**: help a treasurer back in when the magic link didn't arrive | **So that**: treasurer adoption is not blocked
- **AC**: `/admin/orgs/[id]/reset-treasurer-login` action calls Auth0 passwordless.start with `connection: 'email'`; rate-limit-aware (≥ 5 min between attempts); audit log; treasurer notified via WhatsApp share with the operator's manual copy
- **Prerequisites**: US-015, US-018
- **Addresses**: F36

#### US-083 — Operator opens an adjustment period after a locked monthly close
- **As**: Operator | **Want to**: re-open a closed period when the treasurer reports a critical missed entry | **So that**: the adjustment is bookkept transparently rather than as an "ajuste de mes anterior" entry forced into the current month
- **AC**: `/admin/orgs/[id]/period-close/[id]/adjust` action requires reason text and confirmation; writes new `ReconciliationCycle.kind = adjustment` referencing original `PeriodClose`; lifts period lock for that cycle ONLY for one defined adjustment window (default 7 days); auto-relocks on window close; audit log; emits a low-severity alert visible to treasurer + operator
- **Prerequisites**: US-046
- **Journey/Process**: S5 recovery path
- **Addresses**: F11

#### US-084 — Treasurer reverses an approved year-end share-out within grace window
- **As**: Treasurer | **Want to**: undo an approved share-out if I see an error before the meeting | **So that**: I don't have to live with the wrong distribution
- **AC**: within 24 h of `YearEndShareOut.status = approved`, action "Revertir reparto" creates N reversal `Withdrawal` rows + supersedes all year-end PDFs (new generation + `StatementArchive.kind = year_end_*_superseded`); `YearEndShareOut.status = reversed`; requires confirmation modal in plain Spanish + reason; after grace window, only operator can reverse via direct DB recovery (audited)
- **Prerequisites**: US-053
- **Addresses**: F8

#### US-085 — Public statement-verifier endpoint accepts hash + returns "matches / does not match"
- **As**: Any member or president | **Want to**: paste the hash from a PDF footer and confirm the PDF is genuine | **So that**: the integrity hash actually builds trust rather than being decorative
- **AC**: public route `GET /verify/[hash]` (no auth); looks up `StatementArchive.canonical_payload_hash = hash`; returns minimal JSON + HTML page in es-EC: "Este documento coincide con el registro del grupo {group_name} al {generated_at}" or "No se encontró un documento con este código"; PDF footer extended with QR code linking to the verify URL + plain-Spanish callout "Toca el código QR para verificar"
- **Prerequisites**: US-047, US-048
- **Addresses**: F24
- **Gap callout**: NEW — the brand spec promised hash as a trust signal, but member-facing verification was never planned

#### US-086 — Per-member statement PDF + year-end PDF explain content richly
- **As**: Member or President | **Want to**: read a PDF that explains itself | **So that**: dispute resolution is by-evidence, not by-trust
- **AC for per-member monthly PDF (extension to US-048)**: includes opening balance row + month-over-month delta + each contribution/withdrawal with `SlipPhoto` reference URL + closing balance + treasurer's name + group's bank account last 4 digits
- **AC for monthly close PDF (extension to US-047)**: includes per-member month-net summary table + open-loans-with-next-due roster + active-alerts snapshot + annotated discrepancy with `resolution_note` + president-friendly headline
- **AC for year-end per-member PDF (extension to US-053)**: includes accumulated savings + saldo ponderado (USD-días) + group total USD-días + share % + plain-Spanish explanation in 3 lines ("Tu participación es proporcional al tiempo que tu dinero estuvo en el fondo durante el año, no al saldo acumulado.") + override + motivo if applied
- **Prerequisites**: US-047, US-048, US-053
- **Addresses**: F21, F22, F23, F52
- **Components introduced**: extended `organism.pdf-statement-template` with new content sections

#### US-087 — Operator runs the design-partner onboarding ceremony with parity-check log
- **As**: Operator | **Want to**: onboard mother as the design partner with a structured parity-check process | **So that**: the pilot's success criteria (3 clean months + "would not go back to paper") are measurable
- **AC**: dedicated `/admin/orgs/[id]/pilot-log` page where operator logs each bi-weekly observation, vocabulary validation answer (per OQ-BR / brand questions), and side-by-side parity check (paper notebook → system → discrepancy); 3-month pilot exit checklist auto-checked when criteria met; outputs a single PDF "pilot exit report"
- **Prerequisites**: US-016, US-018
- **Addresses**: F40
- **Gap callout**: NEW — recognizes that the design-partner relationship is operationally distinct from a generic tenant

---

## C. Findings to apply during Step 10b (per-story-file authoring)

The following findings are AC-level enhancements that fit naturally into the per-story file format Step 10b produces. They are NOT reflected in the inventory above to avoid bloating the index; each will be applied when the story file is written:

- **Cross-cutting AC template** (F9, F61): every write story gets "write + audit log INSERT wrapped in `db.transaction()`; on audit failure, original write rolls back."
- **Period-lock pre-flight clause** (F11, F42): every write story with a `dated_on` gets "if `dated_on ≤ latest PeriodClose.closed_at`, reject with adjustment-entry guidance OR (if operator-mediated US-083) accept into adjustment cycle."
- **NFR-PERF measurable AC** (F26): US-029/033/036/047/051/058 get explicit P95 latency targets.
- **NFR-BR-01 stamp** (F27): US-032/050/053 get `group_config_version_at_origination` (or equivalent) stamp.
- **PDF idempotency** (F28): US-047/053 UPSERT on natural-key for re-generation safety.
- **Auth0+DB saga** (F29): US-016/018 use two-phase / saga pattern.
- **Impersonation hardening** (F30): US-020 explicit start audit + cookie binding + auto-timeout + kill-switch + admin view.
- **Materialized-view refresh timing** (F31): US-031 specifies "same post-commit hook + SWR revalidate."
- **P21..P25 metadata cleanup** (F32, F54): scope's Journey/Process lines tagged with P-cites.
- **Sentry redaction Server Action test** (F33): US-073 includes Server Action error path test.
- **US-017 split** (F34): into US-017a..d.
- **US-008 split** (F25): into US-008a..d.
- **US-027 undo + baja-loan guard** (F35).
- **US-006 local Docker Postgres** (F37) + secrets rotation runbook (F38) + ZIP integrity hash (F43).
- **Member admin fields** (F46): cédula + emergency contact added to US-026.
- **Loan repayment over/under/multi** (F47): US-036 enumerates the three cases.
- **30-sec quick-undo** (F48): design system + US-029/033/036 add toast-undo pattern.
- **Promise message editable** (F49): US-042 AC clarification.
- **OQ-BR9-1 explicit** (F53): US-051 + view definition assert "excludes BaseFundQuotaPayment."
- **`referral_commission_currency`** (F55): added to US-017 AC inventory.
- **Brief success metrics measurable** (F15): US-046 (< 30 min), US-016/017/018 (< 1 day onboarding clock), `/admin` home (consecutive clean months counter).
- **US-019 `bypass_org_rls`** (F45): explicit in AC.
- **US-021 ZIP integrity hash** (F43).
- **US-053 A5 shortfall gate** (F16): AC blocks `Aprobar` when projection < commitment unless treasurer overrides with reason.
- **US-025 wizard resume mechanism** (F41): server-side draft row.
- **US-033/034 eligibility rejection enumeration** (F17): each case (en_pausa/baja borrower, guarantor in default, fiscal-year freeze) with Spanish copy.

## D. Substrate inconsistencies to file (separate edits)

- **P21..P25 missing from `03b_service_blueprint.md`** (F1): the `09b §6` hand-off section described P21..P25 to add to 03b but the actual file was never edited. **Action:** apply the surgical edits to 03b (or file a small IMP if the edits are non-trivial). For now, 08_scope cites P21..P25 as if defined; 03b will be updated to make this true.
- **A8..A13 alert kinds** (F2): documented in `03b §6` (alerts catalogue) but never given AC in 08_scope. **Action:** US-061..068 will be split into 14 separate stories in Step 10b — one per alert kind — OR an explicit "deferred to R2" decision is recorded for A8..A13.

## E. R2-deferred items (out of scope for R1)

- F39 — Cross-org member search + forensic ledger-tree view
- F44 — Partial data export (single fiscal year / member range)
- F50 — Vocabulary toggle per group (`socia` vs `aportante`)
- F56 — Treasurer-side override of compensation cron
- F57 — Alert digest
- F58 — Mass-import members from Excel

## F. Operational items (not stories, but ops practice)

- F59 — Dangerous-op peer-review hook. **Action:** mitigate via a checklist in `Nous/System/PIPELINE_GUIDE.md` (operational runbook), not a story.

---

*Review Pass authored 2026-05-28 by Francisco Lomas via 6-agent parallel review. 62 findings consolidated; 14 new user stories added (US-074..087); critical AC tightening deferred to Step 10b per-story files; substrate inconsistencies (P21..P25, A8..A13) flagged for separate handling.*

*Post-Review-Pass edits (2026-05-28): P21..P25 surgical edits applied to `03b_service_blueprint.md` §2 + 5 new cascade diagrams (C6..C10) added to §3 + §4 concatenation map updated. US-061..068 collapsed-block split into 8 individual stories with full per-alert AC. US-088/089/090 added for A8/A9/A11 (the genuinely missing alert-emit stories — A10/A12/A13 are covered elsewhere as documented in the note above US-088). **Inventory now: 90 stories across 14 epics.***

---

# CHG-001 — New User Stories (US-091..US-099)

> Added 2026-05-29 per **CHG-001** (real-treasurer movement/adjustment cases). Source of truth for the rules these stories implement: `09b_business_rules.md` BR-12..16; journeys: `03_cx_journeys.md` Stage S7 + Solidaridad mini-journey; impact analysis: `Nous/WorkControl/CHG-001_IMPACT_ANALYSIS.md`. All nine are R1 (the operator confirmed no code delivered → undelivered artifacts amendable freely). Per HR-22 they are linked to CHG-001 via `change link-stories`. **These compose with US-074** (`payment_source` cash/bank/petty cash): the CHG-001 `Account` model **generalizes** that field — `cash_box` is the petty-cash account, `group_bank` the bank, plus `treasurer_personal` / `external` for the regularization case.

### Epic 15 — Fund Movements + Multi-Account Regularization + Solidarity (NEW, CHG-001)

#### US-091 — Treasurer sets up and manages the group's accounts
- **As**: Treasurer | **Want to**: register the group's accounts (cuenta de banco, caja chica, mi cuenta personal cuando recibo depósitos del grupo) | **So that**: every movement can say which account it touched and the real fund balance is unambiguous
- **AC**: NEW SCR-accounts: list + add/edit `Account` (`type ∈ {group_bank, cash_box, treasurer_personal, external}`, `name`, `last4` optional, `is_group_fund` derived from type with override); at least one `is_group_fund` account required before recording movements; treasurer-personal accounts are clearly labeled "fuera del fondo — requiere regularización"; append-only status changes (no hard delete); audit log
- **Prerequisites**: US-008, US-026
- **Info needed**: account type, name, last4, is_group_fund
- **Journey/Process**: S1 (setup) + S7; P_ManageAccounts
- **Screens**: SCR-accounts (NEW)
- **Components**: `molecule.confirmation-modal`, `atom.status-pill` (fondo / fuera del fondo)
- **Implements**: BR-12 (multi-account foundation)

#### US-092 — Treasurer records a categorized fund movement (fee / supplies / shared expense)
- **As**: Treasurer | **Want to**: record money leaving the fund — comisión bancaria, tintas/papel/insumos, desayunos para todas — with a category and an optional slip | **So that**: the answer to "¿en qué se fue la plata?" is always complete and evidenced
- **AC**: NEW SCR-record-movement: account picker (group accounts), **required** `category` (`comisión bancaria / insumos / gasto compartido / operativo`), amount (currency-input es-EC), date default today, optional slip photo, optional notes; Server Action with `client_request_id` UNIQUE (idempotent); writes a `Movement` (typed Expense/Withdrawal) + `AuditLogEntry`; inline success copy "Movimiento registrado — {category}, {currency} {amount}"; fund balance + cash-flow refresh
- **Prerequisites**: US-091, US-009
- **Info needed**: account_id, category, amount, dated_on, optional slip, client_request_id
- **Journey/Process**: S7 step TB_S7_1; P_RecordMovement
- **Screens**: SCR-record-movement (NEW)
- **Components**: `molecule.currency-input`, `molecule.slip-uploader`, `molecule.confirmation-modal`, `atom.status-pill`
- **Implements**: BR-13 (categorization), BR-16 (audit)

#### US-093 — Treasurer records an inter-account transfer (bookkeeping)
- **As**: Treasurer | **Want to**: move money between the group's own accounts (caja chica ↔ banco) | **So that**: the per-account balances match reality without changing the total fund
- **AC**: from SCR-record-movement, "Transferencia entre cuentas" mode: `from_account_id` + `to_account_id` (both group accounts), amount, date, optional notes; writes a `Transfer` with `purpose = transfer`; net effect on total fund = 0 (asserted); both account balances update; audit log
- **Prerequisites**: US-091
- **Info needed**: from_account_id, to_account_id, amount, dated_on
- **Journey/Process**: S7 step TB_S7_3; P_RecordTransfer
- **Screens**: SCR-record-movement (transfer mode)
- **Components**: `molecule.currency-input`, `molecule.confirmation-modal`
- **Implements**: BR-12 (transfer)

#### US-094 — Treasurer regularizes a deposit that landed in a non-group account *(crown jewel)*
- **As**: Treasurer | **Want to**: handle the case where a member deposited into my personal account and then move it into the group account "para regularizar" | **So that**: nobody can ever read my personal-account movement as me taking group money
- **AC**: when a contribution/repayment is recorded against a **non-`is_group_fund`** account, it is born `reconciliation_status = pending` and shows a "pendiente de regularizar" pill; a "Regularizar" action opens a `Transfer` (`purpose = regularization`, `to_account_id` = a group-fund account, `regularizes_kind`/`regularizes_id` set), which on save flips the source row to `regularizado`; the fund balance is **unchanged** by the original pending deposit and **only increases** when the regularizing transfer lands; the pending row + the regularizing transfer both appear on the member statement and public-verify (never hidden); audit log on both
- **Prerequisites**: US-091, US-029 (contribution), US-036 (repayment)
- **Info needed**: pending source row, target group account, amount
- **Journey/Process**: S7 step TB_S7_3 (regularization); P_RegularizeDeposit
- **Screens**: SCR-record-movement (regularization mode); pending pill surfaced on SCR-treasurer-home / member-detail / SCR-monthly-close
- **Components**: `atom.status-pill` (pendiente/regularizado), `molecule.confirmation-modal`
- **Implements**: BR-12 (crown jewel)

#### US-095 — Period close blocks while unregularized movements exist (reconciliation panel)
- **As**: Treasurer | **Want to**: be stopped from closing the month while a deposit is still sitting unregularized | **So that**: a locked period is always a true, reconciled period
- **AC**: extend SCR-monthly-close with a reconciliation panel listing every `reconciliation_status = pending` row in the period; the "Cerrar el mes" / lock action is **disabled** while any pending row exists (composes the `period_lock_invariant`); each row has a one-tap "Regularizar" entry (US-094); once zero pending, lock enables; the lock is **rejected server-side** too (not only a disabled button) so a savvy treasurer cannot close past it (BR-12 is a hard invariant, not UI text). The close PDF **itemizes the month's fund movements by category** (comisiones / insumos / gastos compartidos / transferencias) **and the net-of-expenses fund balance**, plus asserts "cero movimientos pendientes de regularizar" — so El Presidente (P02), whose only artifact is the WhatsApp PDF, sees both *where the money went* and *that nothing is unreconciled* at a glance (closes the journey↔screen drift surfaced in the P02 walkthrough)
- **Prerequisites**: US-094, US-044 (monthly close)
- **Info needed**: pending rows in period, period state
- **Journey/Process**: S5 ∩ S7 step TB_S7_5; P_LockPeriod (guard)
- **Screens**: SCR-monthly-close (extended)
- **Components**: `organism.reconciliation-panel`, `atom.status-pill`
- **Implements**: BR-12 (period-lock invariant)

#### US-096 — Treasurer starts an extraordinary / solidarity collection
- **As**: Treasurer | **Want to**: open a colecta solidaria for a member's calamidad doméstica (or to recognize a gestión) | **So that**: contributions are tracked fairly and visibly instead of in my head
- **AC**: NEW SCR-solidarity-collection: create `ExtraordinaryCollection` (`open`) with purpose + beneficiary (a member) + optional target amount; add `ExtraordinaryCollectionLine` rows (member + amount + account, → `collecting`); lines landing in a non-group account are flagged `pending` (BR-12); live "X de Y socias han aportado — recaudado {currency} {sum}"; audit log
- **Prerequisites**: US-091, US-026
- **Info needed**: purpose, beneficiary_member_id, optional target, per-line (member, amount, account_id)
- **Journey/Process**: Solidaridad mini-journey (collect); P_ExtraordinaryCollect
- **Screens**: SCR-solidarity-collection (NEW)
- **Components**: `molecule.member-picker`, `molecule.currency-input`, `organism.collection-progress`
- **Implements**: BR-14 (lifecycle: open → collecting)

#### US-097 — Treasurer records a solidarity payout and closes the collection
- **As**: Treasurer | **Want to**: pay the collected money to the beneficiary and close the colecta | **So that**: everyone sees it was fully and fairly disbursed
- **AC**: from SCR-solidarity-collection, "Registrar pago" disburses a single `Movement` (`category = solidarity_payout`, label "pago solidario") to the beneficiary; the payout is **capped** at the regularized collected total (BR-14 arithmetic invariant — UI prevents over-payout); cannot pay out while any line is `pending` (BR-12); on save the collection → `paid_out` → `closed`; surplus (collected − paid) handled explicitly (return transfer or retain, treasurer chooses); contributors' statements + public-verify show the collection and that it was paid out; audit log
- **Prerequisites**: US-096
- **Info needed**: collection, collected total, payout amount, surplus disposition
- **Journey/Process**: Solidaridad mini-journey (payout); P_SolidarityPayout
- **Screens**: SCR-solidarity-collection (payout mode)
- **Components**: `molecule.currency-input`, `molecule.confirmation-modal`
- **Implements**: BR-14 (paid_out → closed), BR-16

#### US-098 — Treasurer records a treasurer-compensation payout gated by a recognized amount
- **As**: Treasurer | **Want to**: receive the value the group recognizes for my gestión, recorded properly | **So that**: it is transparent and never looks like I paid myself an arbitrary sum
- **AC**: a `Movement` (`category = treasurer_comp_payout`, label "pago a tesorera") is only accepted up to `recognized_amount(fiscal_year)` = BR-07 accrued compensation + Σ(closed `ExtraordinaryCollection` rows with `kind = treasurer_recognition`); UI shows the remaining recognized ceiling (e.g. "Reconocido $X · pagado $Y · disponible $Z") and **blocks** a payout above it; the payout is deducted at share-out exactly as BR-11 states (a withdrawal, not part of the distributable pool); shows on public-verify + statements; audit log
- **Prerequisites**: US-091, US-017 (BR-07 config), US-096 (recognition collection, optional path)
- **Info needed**: recognized_amount (accrual + collections), payout amount
- **Journey/Process**: S7 / Solidaridad (recognition variant); P_TreasurerCompPayout
- **Screens**: SCR-record-movement (treasurer-comp mode) or SCR-solidarity-collection (recognition variant)
- **Components**: `molecule.currency-input`, `molecule.confirmation-modal`
- **Implements**: BR-15 (composes BR-07/08)

#### US-099 — Statements, cash-flow, and public-verify reflect all movements net + collections
- **As**: Member / Presidente / anyone with the public link | **Want to**: see the fund balance net of fees and expenses, plus any solidarity collection I took part in | **So that**: the number I see is the real, spendable fund and nothing is off-ledger
- **AC**: extend per-member statement (US-048), SCR-statements-archive, SCR-cash-flow-projection, SCR-year-end-share-out base, and SCR-public-verify-pdf to include `Movement` (by category), `Transfer` (regularizations visible), and `ExtraordinaryCollection` lines/payouts; fund balance shown is **net** of expenses; share-out base (BR-09) computes on the regularized group-fund balance; transparency test asserts every movement/transfer/collection in the period appears (no omissions)
- **Prerequisites**: US-092, US-094, US-097, US-048
- **Info needed**: movements, transfers, collections for the period/member
- **Journey/Process**: S6 + Solidaridad; P_RenderStatement / P_PublicVerify
- **Screens**: SCR-statements-archive, SCR-cash-flow-projection, SCR-year-end-share-out, SCR-public-verify-pdf, per-member statement PDF (all extended)
- **Components**: existing statement/verify renderers (extended)
- **Implements**: BR-16 (transparency), BR-09 (share-out base net)

> **Inventory after CHG-001: 99 stories across 15 epics.** US-091..099 link to CHG-001 (HR-22) and will receive 10b story files with `Blocked By` rows (HR-11) when scheduled into a sprint.

---

# R2 Backlog Registry — Consolidated Deferred Items

> **Why this section exists.** Across the full pipeline (Steps 0..9 + 9b), 30+ items have been intentionally deferred from R1. Without a single registry, they risk being forgotten when R2 planning starts. This is the authoritative list. Every item carries: source (which artifact and section flagged it), category, rationale for deferral, and a brief "what it would take" estimate.

## R2 — Member-side surface (largest cluster)

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-MEM-01 | Member-side PWA with magic-link auth via WhatsApp | `PRODUCT_BRIEF.md §Future Considerations`, `02_cx_personas P03`, `03_cx_journeys S6 mini-journey` | Out of R1 scope; members stay artifact-only in R1 | New auth flow + read-only screens + R2 brand work |
| R2-MEM-02 | Member self-serves PDF statement (no treasurer mediation) | brief, `02 §SEC9 O-M3` | depends on R2-MEM-01 | Small (reads existing StatementArchive) |
| R2-MEM-03 | Member submits deposit slip directly (treasurer approves) | brief, `01_research §5.4 R3` | depends on R2-MEM-01 + a pending-approval state | Medium |

## R2 — WhatsApp integration

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-WA-01 | WhatsApp Business API integration for automated receipts | brief, `03b §2 P17 note` | R1 uses manual share-intent | API key + R2 alerts engine extension |
| R2-WA-02 | WhatsApp Business API for chase reminders (A2/A3/A6) | `03b §6 R1 default no_outbound_whatsapp` | R1 surfaces alert in bell only | Same infra as R2-WA-01 |
| R2-WA-03 | Auth0 magic-link via WhatsApp instead of email | `09_architecture asr_002 + Auth0 docs` | R1 email only | Auth0 + WhatsApp passwordless config |

## R2 — Operational + admin enhancements

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-OP-01 | Cross-org member search (`/admin/members?phone=…`) | Operator review F39 | Operator can't help "soy María del banquito X" without psql today | Admin slice extension |
| R2-OP-02 | Forensic ledger-tree view per transaction | Operator review F39 | dispute resolution needs full tree (entry + reversal + audit + cycle) | Admin slice extension |
| R2-OP-03 | Multi-operator platform roles + RBAC | `02_cx_personas P04`, `03b §2 O-A9` | R1 single super-user | Auth0 roles + permission gates |
| R2-OP-04 | Customer-success signal-driven proactive reach-out engine | `03b §1 R2 progression` | R1 reactive support only | Signal definitions + email/WhatsApp outbound |
| R2-OP-05 | Partial data export (single fiscal year / member range) | Operator review F44 | R1 only full ZIP | Server Action extension |
| R2-OP-06 | All-current-impersonations admin view + auto-timeout + kill-switch | Operator review F30 (part) | R1 has start/end only | Small admin slice extension |
| R2-OP-07 | Treasurer override of compensation cron (skip a month) | PO/BA F56 | R1 cron-only | UI + API on `/grupo` |
| R2-OP-08 | Alert digest / daily summary inbox | PO/BA F57 | R1 individual alerts only | UX work + scheduling |
| R2-OP-09 | Mass-import members from existing Excel | PO/BA F58 | R1 manual one-by-one | CSV parser + idempotent batch insert |

## R2 — Loan engine + business rule extensibility

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-LOAN-01 | Compound interest rate model | `09b BR-01 alternatives` | R1 `flat_per_period` + `declining_balance` only | New domain function + golden file |
| R2-LOAN-02 | Simple-with-fee rate model | `09b BR-01 alternatives` | R1 declining-balance default | Domain function |
| R2-LOAN-03 | Loan modification flow (reschedule / refinance) | Treasurer review (implied) | R1 no modification (only payoff or reversal) | New state transition + entity |
| R2-LOAN-04 | Automatic guarantor debit on non-member loan default | `09b OQ-BR5-1` | R1 alert-only per design partner | Domain function + auth |
| ~~R2-LOAN-05~~ | Late-fee automation on overdue installments | **PULLED INTO R1 by CHG-002 (BR-17, US-100..104)** | ~~R1 no late fees~~ → R1 mora on overdue loan installments (`config.mora`) | Done in CHG-002 |
| R2-LOAN-06 | Treasurer compensation `kind=pct_of_interest` | `09b BR-07 future shapes` | R1 fixed periodic only | JSONB branch + cron extension |
| R2-LOAN-07 | Treasurer compensation `kind=portion_of_admin_fee` | `09b BR-07 future shapes` | same | JSONB branch |
| R2-LOAN-08 | Treasurer compensation `kind=combination` | `09b BR-07 future shapes` | same | JSONB branch |
| R2-LOAN-09 | Daily interest accrual resolution (vs per-period) | `09b OQ-BR2`, `03b §2 P5` | R1 per-period default | Cron resolution config |
| R2-LOAN-10 | Admin fee distributed at share-out (vs retained) | `09b OQ-BR11-1` | R1 retained in pool default | Config field + share-out branch |

## R2 — Treasurer UX refinements

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-UX-01 | Vocabulary toggle per group (`socia` vs `aportante`) | Treasurer review F50 | R1 brand-locked vocabulary; design-partner may need other words | `GroupConfig.member_label_kind` + strings file |
| R2-UX-02 | Reconsider "Liquidez Proyectada" terminology | Treasurer review F51 | R1 banky term; design-partner walkthrough decision | Strings file rename |
| R2-UX-03 | Loan principal prepayment flow | Treasurer review (implied; not in 08_scope) | R1 only scheduled repayments | Schedule recomputation |
| R2-UX-04 | Member rejoin after `baja` | Treasurer review (implied) | R1 baja is terminal | State transition |

## R2 — OCR + media

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-OCR-01 | OCR on deposit-slip photos | brief, `03b §1 R2 progression` | R1 manual entry + photo evidence only | Vendor selection + integration |

## R3 — Multi-tenancy + multi-currency + compliance

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R3-MC-01 | Multi-currency per organization (designed-for, gated) | brief, `09 architecture`, `04 ER all money columns decimal(18,4)` | R1 USD only; schema ready | Conversion + currency-picker UI |
| R3-MC-02 | Multiple Spanish variants beyond es-EC | brief, `05_brand §SEC11` | R1 es-EC only | Strings files per variant |
| R3-MC-03 | English UI | brief | R1 es-EC only | Strings file |
| R3-COMPL-01 | KYC / AML / tax reporting flows | brief, `08_scope SEC4 out` | R1 closed-group framing | Per-jurisdiction work |
| R3-COMPL-02 | GDPR-style deletion-on-request workflow | Operator review, `08_scope SEC4 out` | R1 retains indefinitely | Audited deletion paths |
| R3-INFRA-01 | Bank API / open-banking statement import | brief | R1 manual entry | Per-bank integration |
| R3-INFRA-02 | SRE-grade observability + multi-region | `03b §1 R2 progression`, `09 NFR-AVAIL-01` | R1 Vercel + Neon managed | Vendor + on-call structure |
| R3-INFRA-03 | Anti-fraud rule engine cross-tenant | `03b §1 R2 progression` | R1 no fraud signals | Rules + ML |
| R3-PII-01 | Encryption-at-rest of member WhatsApp numbers | `04 ER §SEC6`, `09 NFR-SEC-05` | R1 plain — closed-group framing | `pgcrypto` column-level |
| R3-AUTH-01 | Federated identity / SSO | `09 architecture asr` (implicit) | R1 Auth0 magic-link only | Auth0 federation config |
| R3-PWA-01 | Native iOS / Android apps | `08_scope SEC4 out` | R1 PWA only | New codebases |
| R3-SMS-01 | SMS notifications | `08_scope SEC4 out` | R1 WhatsApp covers | Twilio integration |

## R2 — Trust + verification

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| R2-TRUST-01 | `BaseFundQuotaPayment` supplemental / top-up mid-year | `03b §2 P24 R1 note` | R1 one quota per year per member | New transaction kind |

## R2 — Pipeline substrate (filed as IMPs)

| ID | Item | Source | Rationale | Effort hint |
|---|---|---|---|---|
| IMP-206 | Project-resolver IMP-198/HR-36 gap (CLI + config import) | Filed 2026-05-28 during this project setup | Substrate gap | Per `IMP-206_TECH_SPEC.md` |
| IMP-207 | Formalize sibling/branch artifacts (`03b`, `09b`) in canonical pipeline_steps registry | Filed 2026-05-28 during 03b authoring | Substrate gap; this catalogue + `09b` depend on it | Per `IMP-207_TECH_SPEC.md` |

## Operational practices (not stories — go into pipeline guide)

| ID | Item | Source | What it means |
|---|---|---|---|
| OP-01 | Dangerous-op peer-review hook (IMP-206-class risk against design partner) | Operator review F59 | Add a checklist in `Nous/System/PIPELINE_GUIDE.md` requiring snapshot + dry-run + IMP filing BEFORE any direct-DB write outside Server Action path |
| OP-02 | Monthly drift sweep practice | Operator review | Calendar reminder + log per `/admin/drift` |
| OP-03 | Monthly Neon backup-restore test | Operator review | Verify NFR-DURAB-01 |
| OP-04 | Monthly cost review across Vercel + Neon + Auth0 + Vercel Blob | Operator review F38 area | NFR-COST-01 verification |
| OP-05 | Secrets rotation playbook (`CRON_SECRET`, `AUTH0_CLIENT_SECRET`, `VERCEL_BLOB_RW_TOKEN`) | Operator review F38 | Runbook R-7 |

---

*R2 Backlog Registry consolidates 30+ deferred items across the pipeline so nothing is lost between R1 ship and R2 planning. Every item has a source pointer back to the originating artifact + section. New deferrals should be added here as they surface in future review passes.*

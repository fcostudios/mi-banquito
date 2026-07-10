### SEC01 — Context Snapshot

Mi Banquito is the digital notebook of a community savings group: a PWA that lets the treasurer of a banquito record contributions, loans, repayments, reconciliation, and year-end share-out in plain es-EC Spanish on a low-end Android phone. The journey scope is end-to-end, S1 (group setup) through S6 (statement distribution + year-end share-out), plus the platform operator's PA-S1..PA-S7 admin substages and a single public PDF verifier surface. Every screen ships in two visual registers from the same component library: the treasurer console (warm cream canvas, ≥ 18 px body, ≥ 48 px tap targets, locked vocabulary) and the `/admin` slice (denser tables, monospace for IDs/hashes, technical voice).

### SEC02 — Persona & Role Mapping

Target persona: **La Tesorera (P01)** for the bulk of screens. Secondary active persona: **La Operadora de la Plataforma (P04)** for the admin slice. Artifact-only personas: **El Presidente (P02)** + **El Miembro/a (P03)** — they never log in in R1; they receive PDFs via WhatsApp and (NEW per US-085) can verify the integrity hash on a public route.

| Real persona | Role label in JSON |
|---|---|
| La Tesorera (P01) | `tesorera` |
| La Operadora de la Plataforma (P04) | `platform_operator` |
| El Presidente (P02) | (no app login R1; PDF reader via WhatsApp) |
| El Miembro/La Miembra (P03) | (no app login R1; PDF reader via WhatsApp) |
| Public (anonymous) | `public` (verifier endpoint only) |

### SEC03 — Journey-to-Screens Strategy

**Per La Tesorera (P01):**
- S1 Group setup + member admin → SCR-first-run-wizard, SCR-members-list, SCR-add-member, SCR-member-detail, SCR-group-config
- S2 Contribution cycle → SCR-treasurer-home, SCR-contributions-cycle, SCR-record-contribution, SCR-record-base-fund-quota (NEW per BR-08), SCR-ar-aging
- S3 Loan lifecycle → SCR-loans-list, SCR-originate-loan (with member + non-member variants per BR-04/05), SCR-loan-detail, SCR-record-repayment
- S4 Collections + liquidity → SCR-ar-aging, SCR-cash-flow-projection
- S5 Reconciliation + monthly close → SCR-monthly-close
- S6 Statement distribution + year-end → SCR-statements-archive, SCR-year-end-share-out
- S7 Movimientos del fondo / Ajustes (CHG-001) → SCR-accounts, SCR-record-movement (fee/expense/transfer/regularization/treasurer-comp), SCR-monthly-close (close blocked while unregularized), SCR-public-verify-pdf + SCR-cash-flow-projection (movements net)
- Solidaridad mini-journey (CHG-001) → SCR-solidarity-collection (collect → payout → close)
- Cross-cutting → SCR-history (Historial in plain Spanish), alerts bell organism (embedded in app header — not its own screen)

**Per La Operadora (P04):**
- PA-S0 Provisioning → no app screen (CLI + provider dashboards)
- PA-S1..PA-S2 Create + configure org → SCR-admin-home, SCR-admin-orgs-new, SCR-admin-org-detail, SCR-admin-org-config (split per F34 into 4 sub-tabs)
- PA-S3 Invite treasurer → embedded in SCR-admin-org-detail
- PA-S4 Observe health → SCR-admin-home, SCR-admin-business-rules
- PA-S5 Read-only impersonation → SCR-admin-impersonation + cross-cutting impersonation banner on treasurer screens
- PA-S6 Data export → SCR-admin-export
- PA-S7 Substrate drift surface → SCR-admin-drift, SCR-admin-cron-runs (NEW per US-081)
- Cross-cutting → SCR-admin-audit (bitácora), SCR-admin-pilot-log (NEW per US-087)

**Public surface (US-085):** SCR-public-verify-pdf — anyone with the hash from a PDF footer or a QR scan can verify the document matches the registered group's record.

**Business processes / modules from inputs:** member registry; contribution cycle; loan origination; loan repayment; interest accrual; A/R aging; collections; reconciliation; monthly close; per-member statement distribution; year-end share-out (time-weighted with by-source breakdown); cash-flow projection; alerts; audit log (Historial); base-fund quota; treasurer compensation; referral commission; non-member loans with guarantors; admin lifecycle (create/freeze/archive/export/impersonation/audit/drift/pilot-log/business-rules).

**"Order/nota" equivalents in this domain (treated as transaction kinds):** `aporte` (Contribution), `retiro` (Withdrawal), `pago de préstamo` (Repayment), `gasto del grupo` (Expense), `cuota base` (BaseFundQuotaPayment), `comisión por referido` (LoanReferral credit), `compensación de tesorera` (TreasurerCompensationDisbursement). Each kind appears in SCR-history with kind-filter; each has its own create/record flow on a dedicated screen or sub-flow.

**Key moments:**
- *Decision points:* loan eligibility pre-flight (US-033/034); reconciliation tolerance (US-044); year-end share-out approval (US-053); operator impersonation start (US-020).
- *Data capture points:* every "registrar X" flow; group config; first-run wizard.
- *Validation points:* declining-balance schedule (BR-01); guarantor required for non-member (BR-05); period-lock pre-flight on every dated write.
- *Failure/recovery paths:* offline-queued writes (US-077); reversal pattern (US-030); operator-mediated adjustment period (US-083); year-end share-out reversal within grace window (US-084).

### SEC04 — Screen Inventory

**Global inventory (33 screens):**

| screen_id | Title | Route | Primary purpose |
|---|---|---|---|
| `SCR-treasurer-home` | Inicio | `/` | Home dashboard: 3 primary actions + live A/R aging + alerts bell |
| `SCR-members-list` | Socias | `/socias` | Member list with status + balance |
| `SCR-add-member` | Agregar socia | `/socias/nueva` | One-screen member admission |
| `SCR-member-detail` | Detalle de socia | `/socias/[id]` | Member profile + balance + history + actions |
| `SCR-contributions-cycle` | Aportes | `/aportes` | Active cycle view + per-member compliance |
| `SCR-record-contribution` | Registrar aporte | `/aportes/registrar` | One-screen deposit recording with slip photo + payment source (US-074) |
| `SCR-record-base-fund-quota` | Registrar cuota base | `/cuota-base/registrar` | NEW per BR-08 — annual base-fund quota payment |
| `SCR-loans-list` | Préstamos | `/prestamos` | Active loans with status + outstanding |
| `SCR-originate-loan` | Nuevo préstamo | `/prestamos/nuevo` | Single screen with member/non-member toggle + guarantor picker + referrer picker (BR-04/05/06) |
| `SCR-loan-detail` | Detalle del préstamo | `/prestamos/[id]` | Tabbed: Resumen / Cronograma (BR-01) / Pagos / Historial |
| `SCR-record-repayment` | Registrar pago | `/prestamos/[id]/pago` | Repayment with auto-split breakdown |
| `SCR-ar-aging` | Atrasos | `/atrasos` | Live A/R aging sorted by days late |
| `SCR-monthly-close` | Cierre del mes | `/cierre` | Reconciliation + close wizard (bank + petty cash per US-074) |
| `SCR-cash-flow-projection` | Liquidez proyectada | `/liquidez` | 12-month projection + sandbox + available capital (pool − base fund) |
| `SCR-statements-archive` | Estados de cuenta | `/estados` | Statement archive with batch + per-member generate + share intent |
| `SCR-year-end-share-out` | Reparto fin de año | `/reparto` | Wizard with time-weighted by-source breakdown + reversal grace per US-084 |
| `SCR-history` | Historial | `/historial` | Plain-Spanish audit narration with member/kind/date filter |
| `SCR-group-config` | Mi grupo | `/grupo` | View + edit group rules (HR-1 versioned) |
| `SCR-first-run-wizard` | Bienvenida | `/bienvenida` | 3-screen first-run setup |
| `SCR-admin-home` | Admin Inicio | `/admin` | Per-org health snapshot + drift badge + active impersonations |
| `SCR-admin-orgs-new` | Nueva organización | `/admin/orgs/nueva` | Create tenant org with all BR config |
| `SCR-admin-org-detail` | Detalle de org | `/admin/orgs/[id]` | Org overview + lifecycle (freeze/archive/export US-080) + invite |
| `SCR-admin-org-config` | Configuración de reglas | `/admin/orgs/[id]/config` | 4 tabs per F34 split: cycle, loans, treasurer+base-fund, fiscal+share-out |
| `SCR-admin-business-rules` | Reglas del grupo | `/admin/orgs/[id]/business-rules` | NEW per US-024 — read-only rule values + EntityVersion history |
| `SCR-admin-impersonation` | Ver como tesorera | `/admin/orgs/[id]/impersonate` | Start impersonation with required reason |
| `SCR-admin-export` | Exportar datos | `/admin/orgs/[id]/export` | Trigger + history of exports |
| `SCR-admin-audit` | Bitácora | `/admin/audit` | Dense audit table with filters |
| `SCR-admin-drift` | Estado del substrato | `/admin/drift` | Drift status + last check + raw report |
| `SCR-admin-cron-runs` | Estado de crons | `/admin/cron-runs` | NEW per US-081 — cron history + manual replay |
| `SCR-admin-pilot-log` | Bitácora del piloto | `/admin/orgs/[id]/pilot-log` | NEW per US-087 — design-partner observation log + parity check |
| `SCR-public-verify-pdf` | Verificar documento | `/verify/[hash]` | NEW per US-085 — PUBLIC route, no auth, hash-input verifier; CHG-001 adds movements/collections transparency block (US-099) |
| `SCR-accounts` | Cuentas del grupo | `/cuentas` | NEW per CHG-001/US-091 — multi-account registry (banco, caja chica, cuenta personal, externa); fund vs out-of-fund (BR-12) |
| `SCR-record-movement` | Registrar movimiento | `/movimientos/registrar` | NEW per CHG-001/US-092/093/094/098 — categorized outflow, inter-account transfer, deposit regularization (crown jewel), treasurer-comp payout |
| `SCR-solidarity-collection` | Colecta solidaria | `/colectas` | NEW per CHG-001/US-096/097 — extraordinary collection lifecycle (open→collecting→paid_out→closed) for calamity / treasurer recognition (BR-14) |

**Per-persona inventory:**

*Persona: La Tesorera (`tesorera`)* — `SCR-treasurer-home`, `SCR-members-list`, `SCR-add-member`, `SCR-member-detail`, `SCR-contributions-cycle`, `SCR-record-contribution`, `SCR-record-base-fund-quota`, `SCR-loans-list`, `SCR-originate-loan`, `SCR-loan-detail`, `SCR-record-repayment`, `SCR-ar-aging`, `SCR-monthly-close`, `SCR-cash-flow-projection`, `SCR-statements-archive`, `SCR-year-end-share-out`, `SCR-history`, `SCR-group-config`, `SCR-first-run-wizard`, `SCR-accounts` (CHG-001), `SCR-record-movement` (CHG-001), `SCR-solidarity-collection` (CHG-001).

*Persona: La Operadora de la Plataforma (`platform_operator`)* — `SCR-admin-home`, `SCR-admin-orgs-new`, `SCR-admin-org-detail`, `SCR-admin-org-config`, `SCR-admin-business-rules`, `SCR-admin-impersonation`, `SCR-admin-export`, `SCR-admin-audit`, `SCR-admin-drift`, `SCR-admin-cron-runs`, `SCR-admin-pilot-log`. The operator can also visit any treasurer screen in *read-only impersonation mode* (per US-020 + US-083), which is a cross-cutting capability, not its own screen.

*Persona: Public (`public`)* — `SCR-public-verify-pdf` only.

*Persona: El Presidente (P02) + El Miembro/a (P03)* — no app screens R1; consume PDF artifacts via WhatsApp + may use `SCR-public-verify-pdf` to verify them.

### SEC05 — Detailed Screen Specs (Narrative)

**SEC05.1 — Inicio (treasurer home)**
- **ID:** `SCR-treasurer-home` — **Route:** `/` — **Goal:** answer "what do I need to do today?" in one glance + 3 primary actions in 1 tap.
- **Entry:** post-login redirect; bottom-bar `Inicio` tab; sidebar top item.
- **Sections:** (i) heading *"¿Qué quieres registrar hoy?"*; (ii) 3 large action tiles — *Registrar aporte*, *Registrar pago de préstamo*, *Ver atrasos*; (iii) live A/R aging summary card (top 5 with status pill); (iv) member quick-search bar for "¿cuánto tiene María?" (US-058); (v) liquidity-projected mini-tile linking to `/liquidez`.
- **Actions:** tap action tile → respective record flow; tap aging row → `SCR-ar-aging`; tap member result → `SCR-member-detail`; alerts bell in header opens slide-over with `Alert[]`.
- **Data needs:** `mv_member_compliance_state` (top 5 by days late), `mv_liquidez_proyectada` (next-12-month min), unread `Alert[]` count.
- **States:** empty (new org, no contributions) shows `molecule.empty-state` with "Aún no hay aportes" CTA → record-contribution; offline shows amber chip "Sin conexión — mostrando últimos datos".
- **Accessibility:** main landmark, h1, skip-to-content; ARIA-live for alerts badge.

**SEC05.2 — Socias (members list)**
- **ID:** `SCR-members-list` — **Route:** `/socias` — **Goal:** find a member fast; see who is `al día / atrasado / en mora`.
- **Entry:** bottom-bar tab; sidebar; member-picker results.
- **Sections:** filter bar (status, role); search; member rows (`molecule.member-row`) showing avatar (initials), name, role pill, balance, status pill; FAB "Agregar socia".
- **Actions:** tap row → `SCR-member-detail`; tap FAB → `SCR-add-member`.
- **Data needs:** `Member[]` filtered by `org_id` + `mv_member_compliance_state`.
- **States:** empty (no members yet) → CTA "Agregar primera socia"; loading → skeleton rows.

**SEC05.3 — Agregar socia**
- **ID:** `SCR-add-member` — **Route:** `/socias/nueva` — **Goal:** add member in 1 screen.
- **Sections:** form fields per US-026 + F46: nombre (required), WhatsApp (E.164-masked optional), cédula (NEW per F46, optional), contacto de emergencia (NEW, optional), rol (default `aportante`), fecha de ingreso (default today), ahorros iniciales (default 0).
- **Actions:** Guardar → INSERT Member + EntityVersion + AuditLogEntry; redirects to `SCR-member-detail` of new member.
- **Failure:** required field missing → inline error in Spanish; network failure → offline-queue chip per US-077.

**SEC05.4 — Detalle de socia**
- **ID:** `SCR-member-detail` — **Route:** `/socias/[id]` — **Goal:** see one member's full state + take actions.
- **Sections:** header (avatar, name, role pill, status pill, current balance large numeric); tabs Resumen / Aportes / Préstamos / Historial / Acciones; "Pausar" / "Dar de baja" actions in Acciones tab per US-027.
- **Actions:** tap aporte row → reversal flow (US-030); share balance via WhatsApp; generate per-member statement on-demand.
- **Data:** `Member`, `Contribution[]`, `Loan[]`, `AuditLogEntry[]` filtered by member.

**SEC05.5 — Aportes (contributions cycle)**
- **ID:** `SCR-contributions-cycle` — **Route:** `/aportes` — **Goal:** see who paid + who is pending in the active cycle.
- **Sections:** active cycle header (`2026-05`, expected amount, count paid / total), per-member compliance grid with `parcial / al_día / atrasado / en_mora` (per US-075); FAB "Registrar aporte".
- **Actions:** member-row tap → quick balance preview; FAB → `SCR-record-contribution`.

**SEC05.6 — Registrar aporte**
- **ID:** `SCR-record-contribution` — **Route:** `/aportes/registrar` — **Goal:** record a deposit in 3 taps.
- **Sections:** member picker; amount (currency-input); date (default today); **payment source selector (NEW per US-074: `banco / efectivo en reunión / caja chica`)**; slip photo (conditional — required only for `banco`); notes optional.
- **Actions:** Guardar → P1 RecordContribution with `client_request_id`; success inline copy *"Aporte de María registrado — USD 50, 12 de mayo"*; offline → US-077 amber chip.
- **Validations:** amount > 0; period-lock pre-flight per US-046b.

**SEC05.7 — Registrar cuota base (NEW)**
- **ID:** `SCR-record-base-fund-quota` — **Route:** `/cuota-base/registrar` — **Goal:** record the annual base-fund cuota separately from regular aportes (per BR-08 + OQ-BR8-1 option a).
- **Sections:** member picker (filtered to members without quota paid for current fiscal year); amount (default = `BaseFundQuotaConfig.per_member_amount`, editable); date default today; slip photo optional; informational note *"La cuota base es independiente de los aportes mensuales y no recibe interés a fin de año."*
- **Actions:** Guardar → P24 CollectBaseFundQuota; refreshes available-capital views.
- **Failure:** `BaseFundQuotaConfig` not set for current fiscal year → blocking copy *"Falta configurar la cuota base. Pídele al operador que la cargue para el año {fiscal_year}."*

**SEC05.8 — Préstamos (loans list)**
- **ID:** `SCR-loans-list` — **Route:** `/prestamos` — **Goal:** see active loans + status.
- **Sections:** filter (status: activo / pagado / en_mora / cancelado); loan rows (member, principal, outstanding, next due, status pill); FAB "Nuevo préstamo".

**SEC05.9 — Nuevo préstamo**
- **ID:** `SCR-originate-loan` — **Route:** `/prestamos/nuevo` — **Goal:** issue a loan with all the math computed (BR-01..06).
- **Sections:** borrower-kind toggle (`socia` / `no-socia`); if `socia`, member picker; if `no-socia`, NonMember mini-form + required member-guarantor picker (BR-05); principal (currency-input); plazo en meses; rate (auto-from GroupConfig per kind, treasurer-overridable per OQ-BR4-1); referrer picker (optional per BR-06); disbursement source (`banco / caja chica` per US-076); purpose optional.
- **Eligibility pre-flight (synchronous):** pool capacity minus base fund (US-074); member loan-to-savings cap; borrower not in `pausa`/`baja`; guarantor not in default; if A5 active, block with override-with-reason (US-053 connection).
- **Actions:** Guardar → P3 OriginateLoan + P4 GenerateLoanSchedule + P21 ChargeAdminFee + P10 EvaluateLoanEligibility; redirects to `SCR-loan-detail`.
- **Validation copy** in es-EC per US-033/034 expanded AC.

**SEC05.10 — Detalle del préstamo**
- **ID:** `SCR-loan-detail` — **Route:** `/prestamos/[id]` — **Goal:** see complete loan state.
- **Tabs:** Resumen (member/guarantor/referrer/principal/term/rate/status); Cronograma (schedule rows with admin fee on row 1 per BR-03); Pagos (Repayment[] with split breakdown); Historial (InterestAccrual[] + reversal entries + audit lines).
- **Actions:** "Registrar pago" → `SCR-record-repayment`; "Hacer una reversión" (where applicable) opens confirmation modal.

**SEC05.11 — Registrar pago**
- **ID:** `SCR-record-repayment` — **Route:** `/prestamos/[id]/pago` — **Goal:** record a repayment with automatic split.
- **Sections:** loan summary header (outstanding); amount (currency-input); date; slip optional; notes optional; on submit, system shows split breakdown *"Aplicado: USD X a interés + USD Y a capital"* before confirming.
- **Failure:** over/under per F47 — over → offer to record excess as `Withdrawal`; under → confirm partial; multi-cuotas (amount ≥ 2 installments) → confirm.

**SEC05.12 — Atrasos**
- **ID:** `SCR-ar-aging` — **Route:** `/atrasos` — **Goal:** know who to chase first.
- **Sections:** live aging rows (member, reason aporte/cuota, amount, days late, last action); inline actions per row: "Marcar promesa" (US-078) opens date picker + optional note; "Avisar por WhatsApp" (US-042) opens WhatsApp share with editable pre-filled copy (per F49).
- **Data:** `mv_ar_aging` derived + `Alert[]` kind=promise_marked.

**SEC05.13 — Cierre del mes**
- **ID:** `SCR-monthly-close` — **Route:** `/cierre` — **Goal:** reconcile + lock the period.
- **Sections:** step 1 enter declared bank balance + declared petty cash balance (per US-074); step 2 show discrepancy (bank + petty cash separately) with status pill; step 3 resolve or annotate; final confirm with explicit copy *"Esto no se puede deshacer. Lo que llegue después va al período de ajuste."* (per F46 / US-083 link); generates monthly close PDF on close.
- **Brief KPI AC:** P95 end-to-end < 30 min for a 20-member group with 80 entries (per F15).

**SEC05.14 — Liquidez proyectada**
- **ID:** `SCR-cash-flow-projection` — **Route:** `/liquidez` — **Goal:** see if the group can sustain new loans + share-out.
- **Sections:** narrative summary in es-EC (plain language per F51 — TBD whether to rename to "Cómo va la plata del grupo" — defaulting to current label, R2-UX-02 flagged); 12-month line chart; available-capital figure (pool − base fund per US-074 + US-076 flows); "Considerar un préstamo" sandbox input.

**SEC05.15 — Estados de cuenta**
- **ID:** `SCR-statements-archive` — **Route:** `/estados` — **Goal:** generate + share monthly statements.
- **Sections:** post-close "Generar estados de mayo" CTA; archive table per period; per-member statements list; "Compartir por WhatsApp" per row.
- **PDF content** per US-086: opening balance + month-net + slip photo refs + closing balance + verifier QR (US-085).

**SEC05.16 — Reparto fin de año**
- **ID:** `SCR-year-end-share-out` — **Route:** `/reparto` — **Goal:** distribute the year's interest gains time-weighted.
- **Sections:** step 1 group summary (total interest gains by source per BR-11); step 2 per-member 9-column table (`acumulado / saldo ponderado USD-días / interés socios / interés no-socios / comisión referidos / total borrador / ajuste / total final / motivo`); inline 3-line plain-Spanish explanation of time-weighted concept (per F52 + US-086); step 3 confirm + approve.
- **Reversal:** within 24h of approval, "Revertir reparto" action (US-084) with confirmation + reason.
- **A5 gate:** if year-end shortfall alert active, approve requires explicit override-with-reason (US-053 + F16).

**SEC05.17 — Historial**
- **ID:** `SCR-history` — **Route:** `/historial` — **Goal:** see what happened in plain Spanish.
- **Sections:** filter bar (member, kind, date range); narrated rows *"12 de mayo, 14:23 — Registraste un aporte de María por USD 50."*; tap row → underlying entity detail.

**SEC05.18 — Mi grupo (group config)**
- **ID:** `SCR-group-config` — **Route:** `/grupo` — **Goal:** treasurer reads + edits group rules.
- **Sections:** read-only summary cards per rule cluster (cycle + late thresholds; loans BR-01..06; treasurer comp + base fund BR-07/08; fiscal year + share-out BR-09/10/11); "Editar reglas" enters edit mode with HR-1 versioning; per OQ-BR2-1 rate change banner *"Los préstamos existentes mantienen la tasa anterior."*

**SEC05.19 — Bienvenida (first-run wizard)**
- **ID:** `SCR-first-run-wizard` — **Route:** `/bienvenida` — **Goal:** 3-screen onboarding (group name + logo; rules summary read-only; "Vamos a registrar las socias" CTA); resumable from `Member.count == 0` branch.

**SEC05.20 — Admin Inicio**
- **ID:** `SCR-admin-home` — **Route:** `/admin` — **Goal:** operator at-a-glance.
- **Sections:** drift badge (US-023); per-org snapshot table (name, last activity, last close, reconciliation status, A/R total, drift); active impersonations badge; "Nueva organización" CTA; consecutive-clean-months counter for design-partner org (US-019 + F15).

**SEC05.21 — Nueva organización**
- **ID:** `SCR-admin-orgs-new` — **Route:** `/admin/orgs/nueva` — **Goal:** create tenant org in < 1 day per substrate KPI.
- **Sections:** form (display name, country, currency, timezone, default language, branding logo); on submit, Server Action creates `Organization` + Auth0 Organization (with fallback per OQ-ARCH-2) + seeds `GroupConfig` v1 with defaults; redirects to org-detail.

**SEC05.22 — Detalle de org**
- **ID:** `SCR-admin-org-detail` — **Route:** `/admin/orgs/[id]` — **Goal:** operator org hub.
- **Sections:** header (name + status + Auth0 org id); links to config / business-rules / impersonate / export / audit / pilot-log; treasurer invite section per US-018; lifecycle actions per US-080 (Pausar / Archivar with required reason).

**SEC05.23 — Configuración de reglas**
- **ID:** `SCR-admin-org-config` — **Route:** `/admin/orgs/[id]/config` — **Goal:** configure all 11 BRs cleanly.
- **Sections (4 tabs per F34 split):** (a) Cycle + late/mora thresholds; (b) Loan engine BR-01..06 (rate model, rates member + non-member, period unit, admin fee, referral commission); (c) Treasurer compensation BR-07 + Base fund BR-08 (current fiscal year quota); (d) Fiscal year BR-10 + Share-out formula BR-11 + Reconciliation tolerance.
- **Save:** writes new `GroupConfig` version per HR-1.

**SEC05.24 — Reglas del grupo (admin business rules)**
- **ID:** `SCR-admin-business-rules` — **Route:** `/admin/orgs/[id]/business-rules` — **Goal:** read-only audit of active rule values + history.
- **Sections:** per BR table with current value + last change + who changed it (EntityVersion history); CSV export; "Ver código fuente" links to the `packages/domain/rules/{br}.ts` (for the curious operator).

**SEC05.25 — Ver como tesorera (impersonation start)**
- **ID:** `SCR-admin-impersonation` — **Route:** `/admin/orgs/[id]/impersonate` — **Goal:** start a read-only impersonation session.
- **Sections:** required reason text + "Comenzar"; on start, sets cookie + redirects to treasurer home for that org with impersonation banner pinned across every screen.

**SEC05.26 — Exportar datos**
- **ID:** `SCR-admin-export` — **Route:** `/admin/orgs/[id]/export` — **Goal:** generate + deliver tenant data ZIP.
- **Sections:** "Exportar ahora" button; history of prior exports with hash (per F43 ZIP integrity); per US-085 the ZIP manifest includes per-PDF + per-CSV SHA-256.

**SEC05.27 — Bitácora (admin audit)**
- **ID:** `SCR-admin-audit` — **Route:** `/admin/audit` — **Goal:** cross-org audit forensic search.
- **Sections:** dense filter bar (org, actor kind, action kind, date range); table; per-row payload_snapshot JSON viewer; CSV export.

**SEC05.28 — Estado del substrato (drift)**
- **ID:** `SCR-admin-drift` — **Route:** `/admin/drift` — **Goal:** see drift status.
- **Sections:** drift badge (green / red); last check timestamp; raw report (collapsible); "File IMP from this drift" CTA (operator review F gap; copy pre-fills IMP tech-spec template).

**SEC05.29 — Estado de crons (NEW)**
- **ID:** `SCR-admin-cron-runs` — **Route:** `/admin/cron-runs` — **Goal:** cron history + manual replay (US-081).
- **Sections:** filter by cron endpoint; runs table (timestamp, duration, orgs processed, failures); per-row drill-down with summary JSON; "Replay with from_date / to_date" button per cron endpoint.

**SEC05.30 — Bitácora del piloto (NEW)**
- **ID:** `SCR-admin-pilot-log` — **Route:** `/admin/orgs/[id]/pilot-log` — **Goal:** design-partner observation log + parity check (US-087).
- **Sections:** observation entry form (date, duration, observations text, vocabulary-validation answers per design-partner Qs, parity check: paper-balance vs system-balance per member); 3-month pilot exit checklist auto-checked when criteria met (3 consecutive clean closes + "would not go back to paper" yes); export "Pilot exit report" PDF.

**SEC05.31 — Verificar documento (PUBLIC, NEW)**
- **ID:** `SCR-public-verify-pdf` — **Route:** `/verify/[hash]` — **Goal:** public hash verification (US-085).
- **Sections:** input field (hash, prefilled from URL); on submit, looks up `StatementArchive.canonical_payload_hash`; returns plain-Spanish: *"Este documento coincide con el registro del grupo {group_name} al {generated_at}."* OR *"No se encontró un documento con este código."* QR scanner shortcut for camera-capable devices.
- **No auth.** Rate-limited to prevent enumeration.

---SECTION: SEC06---

### SEC06 — Screens JSON (Schema v3 — IMP-143 input contract)

```json
{
  "screens": [
    {
      "id": "SCR-add-member",
      "title": "Agregar socia",
      "description": "One-screen member admission form per US-026 + F46 (cédula + emergency contact added).",
      "route": "/socias/nueva",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-026"], "change_id": "" },
      "i18n": { "es-EC": { "title": "Agregar socia", "subtitle": "Registrar una nueva miembro del grupo" } },
      "layout": {
        "kind": "page",
        "titleBar": { "subtitle": "Registrar una nueva miembro del grupo" },
        "grid": { "xs": 12, "sm": 12, "md": 8, "lg": 6, "xl": 6 },
        "sections": [
          {
            "id": "form_member",
            "type": "form",
            "gridSpan": { "xs": 12, "sm": 12, "md": 12, "lg": 12, "xl": 12 },
            "fields": [
              { "id": "display_name", "label": "Nombre completo", "type": "text", "required": true },
              { "id": "whatsapp_number", "label": "WhatsApp", "type": "phone", "required": false, "mask": "+593-#########" },
              { "id": "national_id", "label": "Cédula", "type": "text", "required": false },
              { "id": "emergency_contact", "label": "Contacto de emergencia", "type": "text", "required": false },
              { "id": "role", "label": "Rol", "type": "select", "options": ["aportante", "presidenta", "secretaria"], "default": "aportante" },
              { "id": "joined_on", "label": "Fecha de ingreso", "type": "date", "default": "today" },
              { "id": "initial_savings_balance", "label": "Ahorros iniciales (USD)", "type": "currency", "default": "0.00" }
            ],
            "submit": { "id": "btn_save_member", "label": "Guardar", "action": "server_action:addMember", "navigate_to": "SCR-member-detail" },
            "cancel": { "id": "btn_cancel", "label": "Cancelar", "action": "navigate:SCR-members-list" }
          }
        ]
      },
      "accessibility": { "skipToContent": true, "ariaLandmarks": true }
    },
    {
      "id": "SCR-admin-audit",
      "title": "Bitácora",
      "description": "Dense cross-org audit forensic search per US-022.",
      "route": "/admin/audit",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-022"], "change_id": "" },
      "i18n": { "es-EC": { "title": "Bitácora", "subtitle": "Auditoría de eventos cruzando organizaciones" } },
      "layout": {
        "kind": "listing",
        "sections": [
          { "id": "filters", "type": "filters", "gridSpan": {"xs":12}, "fields": [
            { "id": "org_id", "label": "Organización", "type": "select" },
            { "id": "actor_kind", "label": "Actor", "type": "select", "options": ["member", "platform_operator", "system"] },
            { "id": "action_kind", "label": "Acción", "type": "text" },
            { "id": "date_range", "label": "Rango de fechas", "type": "date-range" }
          ]},
          { "id": "audit_table", "type": "data-table", "gridSpan": {"xs":12}, "columns": [
            { "id": "at", "label": "Cuando" }, { "id": "actor", "label": "Actor" },
            { "id": "action_kind", "label": "Acción" }, { "id": "subject", "label": "Sujeto" },
            { "id": "view_payload", "label": "Detalle", "type": "drilldown" }
          ], "row_on_click": "open_payload_drawer" }
        ]
      },
      "accessibility": { "skipToContent": true, "ariaLandmarks": true }
    },
    {
      "id": "SCR-admin-business-rules",
      "title": "Reglas del grupo",
      "description": "Read-only business-rules panel per US-024 + 09b §6.",
      "route": "/admin/orgs/[id]/business-rules",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-024"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "rules_table", "type": "data-table", "gridSpan": {"xs":12}, "columns": [
            { "id": "br_id", "label": "Regla" }, { "id": "current_value", "label": "Valor actual" },
            { "id": "last_changed_at", "label": "Último cambio" }, { "id": "last_changed_by", "label": "Por" }
          ]},
          { "id": "export_csv", "type": "action-bar", "actions": [{ "id": "btn_csv", "label": "Exportar CSV", "action": "download:rules_csv" }] }
        ]
      }
    },
    {
      "id": "SCR-admin-cron-runs",
      "title": "Estado de crons",
      "description": "Cron run history + manual replay per US-081 (Review Pass F20).",
      "route": "/admin/cron-runs",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-081"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "endpoint_picker", "type": "tabs", "tabs": ["accrue-interest", "award-treasurer-compensation", "drift-check", "nightly-snapshot"] },
          { "id": "runs_table", "type": "data-table", "gridSpan": {"xs":12}, "columns": ["timestamp", "duration_ms", "orgs_processed", "failures", "summary"] },
          { "id": "replay_action", "type": "action-bar", "actions": [{ "id": "btn_replay", "label": "Replay with from_date / to_date", "action": "modal:replay_picker" }] }
        ]
      }
    },
    {
      "id": "SCR-admin-drift",
      "title": "Estado del substrato",
      "description": "Drift status badge + last check + raw report per US-023.",
      "route": "/admin/drift",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-023"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "drift_badge", "type": "info-banner", "gridSpan": {"xs":12} },
          { "id": "raw_report", "type": "tabs", "tabs": ["Resumen", "Reporte completo"] },
          { "id": "file_imp", "type": "action-bar", "actions": [{ "id": "btn_file_imp", "label": "Crear IMP desde este drift", "action": "modal:imp_template" }] }
        ]
      }
    },
    {
      "id": "SCR-admin-export",
      "title": "Exportar datos",
      "description": "Trigger + history of tenant exports per US-021 with integrity-hash manifest per F43.",
      "route": "/admin/orgs/[id]/export",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-021"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "export_action", "type": "action-bar", "actions": [{ "id": "btn_export", "label": "Exportar ahora", "action": "server_action:exportOrgData" }] },
          { "id": "export_history", "type": "data-table", "columns": ["generated_at", "operator", "zip_uri", "zip_sha256", "size_bytes"] }
        ]
      }
    },
    {
      "id": "SCR-admin-home",
      "title": "Admin Inicio",
      "description": "Per-org health snapshot + drift badge + active impersonations badge per US-019.",
      "route": "/admin",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-019"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "kpi_strip", "type": "metric-cards", "gridSpan": {"xs":12}, "cards": [
            { "id": "orgs_total", "title": "Organizaciones activas", "value": ":computed:" },
            { "id": "consecutive_clean_months", "title": "Meses con conciliación cero", "value": ":computed:" },
            { "id": "drift_badge", "title": "Drift", "value": ":computed:" }
          ]},
          { "id": "orgs_table", "type": "data-table", "gridSpan": {"xs":12}, "columns": ["org_id", "name", "last_activity_at", "last_close_at", "reconciliation_status", "ar_total", "open_loans_count"] },
          { "id": "new_org_cta", "type": "action-bar", "actions": [{ "id": "btn_new_org", "label": "Nueva organización", "action": "navigate:SCR-admin-orgs-new" }] }
        ]
      }
    },
    {
      "id": "SCR-admin-impersonation",
      "title": "Ver como tesorera",
      "description": "Start read-only impersonation with required reason per US-020.",
      "route": "/admin/orgs/[id]/impersonate",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-020"], "change_id": "" },
      "layout": {
        "kind": "modal",
        "sections": [
          { "id": "impersonation_form", "type": "form", "fields": [
            { "id": "reason", "label": "Motivo (obligatorio)", "type": "textarea", "required": true, "min_length": 10 }
          ], "submit": { "id": "btn_start", "label": "Comenzar impersonación", "action": "server_action:startImpersonation", "navigate_to": "SCR-treasurer-home" } }
        ]
      }
    },
    {
      "id": "SCR-admin-org-config",
      "title": "Configuración de reglas",
      "description": "Operator configures all 11 BRs across 4 tabs per F34 split.",
      "route": "/admin/orgs/[id]/config",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-017"], "change_id": "" },
      "layout": {
        "kind": "tabs-card",
        "sections": [
          { "id": "tabs", "type": "tabs", "tabs": ["Ciclo y atrasos", "Préstamos (BR-01..06)", "Tesorera y fondo base (BR-07/08)", "Año fiscal y reparto (BR-09/10/11)"] },
          { "id": "tab_cycle", "type": "form", "fields": [
            { "id": "contribution_cycle_kind", "label": "Cadencia", "type": "select", "options": ["monthly", "weekly"], "default": "monthly" },
            { "id": "contribution_amount", "label": "Aporte por miembro", "type": "currency" },
            { "id": "late_threshold_days", "label": "Días para 'atrasado'", "type": "integer", "default": 14 },
            { "id": "mora_threshold_days", "label": "Días para 'en mora'", "type": "integer", "default": 30 }
          ]},
          { "id": "tab_loans", "type": "form", "fields": [
            { "id": "loan_rate_model", "label": "Modelo de interés", "type": "select", "options": ["declining_balance", "flat_per_period"], "default": "declining_balance" },
            { "id": "loan_rate_period_unit", "label": "Periodicidad", "type": "select", "options": ["monthly", "weekly"], "default": "monthly" },
            { "id": "loan_rate_value_member", "label": "Tasa socias (%)", "type": "decimal" },
            { "id": "loan_rate_value_non_member", "label": "Tasa no-socias (%)", "type": "decimal" },
            { "id": "loan_grace_periods", "label": "Periodos de gracia", "type": "integer", "default": 0 },
            { "id": "loan_to_savings_cap_ratio", "label": "Cap préstamo / ahorros", "type": "decimal", "default": "3.00" },
            { "id": "admin_fee_pct", "label": "Cargo administrativo (% sobre principal, cobrado en cuota 1)", "type": "decimal", "default": "0.01" },
            { "id": "referral_commission_amount", "label": "Comisión por referido (USD)", "type": "currency", "default": "5.00" }
          ]},
          { "id": "tab_treasurer_base", "type": "form", "fields": [
            { "id": "treasurer_compensation.kind", "label": "Compensación de tesorera — tipo", "type": "select", "options": ["fixed_periodic"], "default": "fixed_periodic" },
            { "id": "treasurer_compensation.amount", "label": "Monto", "type": "currency" },
            { "id": "treasurer_compensation.period", "label": "Periodo", "type": "select", "options": ["monthly", "yearly"] },
            { "id": "base_fund_quota_amount", "label": "Cuota base por miembro (año fiscal en curso)", "type": "currency" }
          ]},
          { "id": "tab_fiscal_share_out", "type": "form", "fields": [
            { "id": "fiscal_year_start_month", "label": "Mes de inicio del año fiscal", "type": "integer", "default": 1 },
            { "id": "fiscal_year_start_day", "label": "Día de inicio", "type": "integer", "default": 1 },
            { "id": "year_end_share_out_formula", "label": "Fórmula de reparto", "type": "select", "options": ["proportional_to_savings", "equal_per_member", "hybrid"] },
            { "id": "reconciliation_tolerance_amount", "label": "Tolerancia de conciliación (USD)", "type": "currency", "default": "1.00" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-admin-org-detail",
      "title": "Detalle de org",
      "description": "Org hub: links to config / business-rules / impersonate / export / audit / pilot-log + lifecycle (freeze/archive) per US-080.",
      "route": "/admin/orgs/[id]",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-016", "US-018", "US-080"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "org_header", "type": "session-header-card" },
          { "id": "treasurer_invite", "type": "form", "fields": [
            { "id": "treasurer_email", "label": "Email de la tesorera", "type": "email", "required": true },
            { "id": "treasurer_display_name", "label": "Nombre", "type": "text", "required": true }
          ], "submit": { "id": "btn_invite", "label": "Invitar a la tesorera", "action": "server_action:inviteTreasurer" } },
          { "id": "lifecycle_actions", "type": "action-bar", "actions": [
            { "id": "btn_freeze", "label": "Pausar", "action": "modal:freeze_confirm", "kind": "warning" },
            { "id": "btn_archive", "label": "Archivar", "action": "modal:archive_confirm", "kind": "danger" }
          ]},
          { "id": "nav_links", "type": "cards-grid", "cards": [
            { "title": "Configuración de reglas", "navigate_to": "SCR-admin-org-config" },
            { "title": "Reglas del grupo (read-only)", "navigate_to": "SCR-admin-business-rules" },
            { "title": "Ver como tesorera", "navigate_to": "SCR-admin-impersonation" },
            { "title": "Exportar datos", "navigate_to": "SCR-admin-export" },
            { "title": "Bitácora del piloto", "navigate_to": "SCR-admin-pilot-log" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-admin-orgs-new",
      "title": "Nueva organización",
      "description": "Operator creates a new tenant org per US-016 with Auth0 fallback per OQ-ARCH-2.",
      "route": "/admin/orgs/nueva",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-016"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "new_org_form", "type": "form", "fields": [
            { "id": "display_name", "label": "Nombre del grupo", "type": "text", "required": true },
            { "id": "country_code", "label": "País", "type": "select", "options": ["EC"], "default": "EC" },
            { "id": "currency_code", "label": "Moneda", "type": "select", "options": ["USD"], "default": "USD" },
            { "id": "timezone", "label": "Zona horaria", "type": "select", "options": ["America/Guayaquil"], "default": "America/Guayaquil" },
            { "id": "default_language", "label": "Idioma", "type": "select", "options": ["es-EC"], "default": "es-EC" },
            { "id": "branding_logo", "label": "Logo (opcional)", "type": "file" }
          ], "submit": { "id": "btn_create_org", "label": "Crear organización", "action": "server_action:createOrg", "navigate_to": "SCR-admin-org-detail" } }
        ]
      }
    },
    {
      "id": "SCR-admin-pilot-log",
      "title": "Bitácora del piloto",
      "description": "Design-partner observation log + parity check + 3-month pilot exit checklist per US-087.",
      "route": "/admin/orgs/[id]/pilot-log",
      "roles": ["platform_operator"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-087"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "observation_form", "type": "form", "fields": [
            { "id": "observed_on", "label": "Fecha", "type": "date" },
            { "id": "duration_minutes", "label": "Duración (min)", "type": "integer" },
            { "id": "observations", "label": "Observaciones", "type": "textarea" },
            { "id": "vocabulary_validation", "label": "Validación de vocabulario", "type": "textarea" },
            { "id": "parity_check", "label": "Paridad papel ↔ sistema", "type": "textarea" }
          ], "submit": { "id": "btn_log", "label": "Guardar entrada", "action": "server_action:logPilotObservation" } },
          { "id": "exit_checklist", "type": "checklist", "items": [
            { "id": "three_clean_closes", "label": "3 cierres consecutivos sin discrepancia" },
            { "id": "no_paper_confirmation", "label": "Tesorera dice: 'no volvería al cuaderno'" },
            { "id": "vocab_validated", "label": "Vocabulario validado por la diseñadora-socia" }
          ]},
          { "id": "export_report", "type": "action-bar", "actions": [{ "id": "btn_report", "label": "Generar reporte de salida del piloto", "action": "download:pilot_exit_report_pdf" }] }
        ]
      }
    },
    {
      "id": "SCR-ar-aging",
      "title": "Atrasos",
      "description": "Live A/R aging sorted by days late descending per US-040 + US-042 chase action.",
      "route": "/atrasos",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-040", "US-041", "US-042", "US-078"], "change_id": "" },
      "layout": {
        "kind": "listing",
        "sections": [
          { "id": "filter_bar", "type": "filters", "fields": [
            { "id": "reason_kind", "label": "Tipo", "type": "select", "options": ["all", "aporte", "préstamo"] }
          ]},
          { "id": "aging_table", "type": "data-table", "columns": ["member", "reason", "amount", "days_late", "last_action"], "row_actions": [
            { "id": "btn_mark_promise", "label": "Marcar promesa", "action": "modal:promise_picker" },
            { "id": "btn_whatsapp", "label": "Avisar por WhatsApp", "action": "share_intent:whatsapp_chase" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-cash-flow-projection",
      "title": "Liquidez proyectada",
      "description": "12-month projection + sandbox + available capital (pool minus base fund) per US-054.",
      "route": "/liquidez",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-054"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "narrative", "type": "info-banner", "content": ":computed:" },
          { "id": "available_capital", "type": "metric-cards", "cards": [
            { "id": "pool_balance", "title": "Capital del grupo (banco + caja chica)", "value": ":computed:" },
            { "id": "base_fund_pool", "title": "Fondo base (no se presta)", "value": ":computed:" },
            { "id": "available_capital", "title": "Capital disponible para préstamos", "value": ":computed:" }
          ]},
          { "id": "projection_chart", "type": "data-table", "columns": ["month", "projected_balance", "inflows", "outflows", "notes"] },
          { "id": "loan_sandbox", "type": "form", "fields": [
            { "id": "hypothetical_principal", "label": "Considera un préstamo (monto)", "type": "currency" },
            { "id": "hypothetical_term", "label": "Plazo (meses)", "type": "integer" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-contributions-cycle",
      "title": "Aportes",
      "description": "Active cycle view with per-member compliance grid (parcial/al_día/atrasado/en_mora) per US-031 + US-075.",
      "route": "/aportes",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-031", "US-075"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "cycle_header", "type": "session-header-card" },
          { "id": "compliance_grid", "type": "data-table", "columns": ["member", "expected", "paid_to_date", "status"], "row_on_click": "navigate:SCR-member-detail" },
          { "id": "fab_record", "type": "action-bar", "actions": [{ "id": "btn_record", "label": "Registrar aporte", "action": "navigate:SCR-record-contribution", "kind": "primary" }] }
        ]
      }
    },
    {
      "id": "SCR-first-run-wizard",
      "title": "Bienvenida",
      "description": "3-screen first-run setup per US-025 with server-side draft row for resume.",
      "route": "/bienvenida",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-025"], "change_id": "" },
      "layout": {
        "kind": "wizard",
        "sections": [
          { "id": "step1_name_logo", "type": "form", "fields": [
            { "id": "group_name", "label": "¿Cómo se llama tu grupo?", "type": "text", "required": true },
            { "id": "logo", "label": "Logo (opcional)", "type": "file" }
          ]},
          { "id": "step2_rules_review", "type": "info-banner", "content": "Esto es lo que tu grupo decidió. Si algo no calza, dímelo." },
          { "id": "step3_ready", "type": "action-bar", "actions": [{ "id": "btn_ready", "label": "Vamos a registrar las socias", "action": "navigate:SCR-add-member" }] }
        ]
      }
    },
    {
      "id": "SCR-group-config",
      "title": "Mi grupo",
      "description": "Treasurer-side view + edit of group rules per US-028 with HR-1 versioning.",
      "route": "/grupo",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-028"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "rules_summary", "type": "cards-grid", "cards": [
            { "title": "Aporte mensual", "value": ":computed:" },
            { "title": "Tasa de interés (socias)", "value": ":computed:" },
            { "title": "Tasa de interés (no-socias)", "value": ":computed:" },
            { "title": "Cargo administrativo", "value": ":computed:" }
          ]},
          { "id": "edit_action", "type": "action-bar", "actions": [{ "id": "btn_edit", "label": "Editar reglas", "action": "modal:edit_rules_form" }] }
        ]
      }
    },
    {
      "id": "SCR-history",
      "title": "Historial",
      "description": "Plain-Spanish audit narration per US-056/057.",
      "route": "/historial",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-056", "US-057"], "change_id": "" },
      "layout": {
        "kind": "listing",
        "sections": [
          { "id": "filter_bar", "type": "filters", "fields": [
            { "id": "member_id", "label": "Socia", "type": "autocomplete" },
            { "id": "action_kind", "label": "Tipo", "type": "select" },
            { "id": "date_range", "label": "Rango de fechas", "type": "date-range" }
          ]},
          { "id": "timeline", "type": "timeline", "fields": [
            { "id": "narrated_text", "label": "Evento", "type": "text" },
            { "id": "at", "label": "Cuándo", "type": "datetime" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-loan-detail",
      "title": "Detalle del préstamo",
      "description": "Loan detail with tabs Resumen / Cronograma (BR-01) / Pagos / Historial per US-037.",
      "route": "/prestamos/[id]",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-037"], "change_id": "" },
      "layout": {
        "kind": "tabs-card",
        "sections": [
          { "id": "tabs", "type": "tabs", "tabs": ["Resumen", "Cronograma", "Pagos", "Historial"] },
          { "id": "summary", "type": "session-header-card" },
          { "id": "schedule_table", "type": "data-table", "columns": ["period", "due_on", "principal_due", "interest_due", "admin_fee_due", "installment_total", "status"] },
          { "id": "repayments_table", "type": "data-table", "columns": ["dated_on", "amount", "applied_to_principal", "applied_to_interest"] },
          { "id": "actions", "type": "action-bar", "actions": [
            { "id": "btn_record_payment", "label": "Registrar pago", "action": "navigate:SCR-record-repayment", "kind": "primary" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-loans-list",
      "title": "Préstamos",
      "description": "Loans list with status + outstanding per US-037.",
      "route": "/prestamos",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-037"], "change_id": "" },
      "layout": {
        "kind": "listing",
        "sections": [
          { "id": "filter_bar", "type": "filters", "fields": [{ "id": "status", "label": "Estado", "type": "select", "options": ["activo", "pagado", "en_mora", "cancelado"] }] },
          { "id": "loans_table", "type": "data-table", "columns": ["member", "principal", "outstanding", "next_due_on", "status"], "row_on_click": "navigate:SCR-loan-detail" },
          { "id": "fab_new", "type": "action-bar", "actions": [{ "id": "btn_new_loan", "label": "Nuevo préstamo", "action": "navigate:SCR-originate-loan", "kind": "primary" }] }
        ]
      }
    },
    {
      "id": "SCR-member-detail",
      "title": "Detalle de socia",
      "description": "Member profile with tabs Resumen / Aportes / Préstamos / Historial / Acciones (Pausar/Baja per US-027).",
      "route": "/socias/[id]",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-027"], "change_id": "" },
      "layout": {
        "kind": "tabs-card",
        "sections": [
          { "id": "member_header", "type": "session-header-card" },
          { "id": "tabs", "type": "tabs", "tabs": ["Resumen", "Aportes", "Préstamos", "Historial", "Acciones"] },
          { "id": "action_pause_baja", "type": "action-bar", "actions": [
            { "id": "btn_pause", "label": "Pausar", "action": "modal:pause_confirm" },
            { "id": "btn_baja", "label": "Dar de baja", "action": "modal:baja_with_refund" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-members-list",
      "title": "Socias",
      "description": "Member list with filter + search per US-026/031.",
      "route": "/socias",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-026", "US-031"], "change_id": "" },
      "layout": {
        "kind": "listing",
        "sections": [
          { "id": "filter_bar", "type": "filters", "fields": [
            { "id": "status", "label": "Estado", "type": "select", "options": ["activo", "en_pausa", "baja"] }
          ]},
          { "id": "search", "type": "form", "fields": [{ "id": "q", "label": "Buscar socia", "type": "text" }] },
          { "id": "members_table", "type": "data-table", "columns": ["display_name", "role", "balance", "status"], "row_on_click": "navigate:SCR-member-detail" },
          { "id": "fab_add", "type": "action-bar", "actions": [{ "id": "btn_add", "label": "Agregar socia", "action": "navigate:SCR-add-member", "kind": "primary" }] }
        ]
      }
    },
    {
      "id": "SCR-monthly-close",
      "title": "Cierre del mes",
      "description": "Reconciliation + close wizard with bank + petty cash separately per US-074, period-lock warning per F46 + US-083.",
      "route": "/cierre",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-044", "US-045", "US-046", "US-074"], "change_id": "" },
      "layout": {
        "kind": "wizard",
        "sections": [
          { "id": "step1_balances", "type": "form", "fields": [
            { "id": "declared_bank_balance", "label": "Saldo declarado del banco (USD)", "type": "currency", "required": true },
            { "id": "declared_petty_cash_balance", "label": "Saldo declarado de caja chica (USD)", "type": "currency", "required": true, "added_per": "US-074" }
          ]},
          { "id": "step2_discrepancy", "type": "info-banner", "content": ":computed:discrepancy_summary" },
          { "id": "step3_resolution", "type": "tabs", "tabs": ["Encontrar la diferencia", "Anotar y aceptar", "Cancelar el cierre"] },
          { "id": "annotation_form", "type": "form", "fields": [
            { "id": "resolution_note", "label": "Motivo (mínimo 10 caracteres)", "type": "textarea", "min_length": 10 }
          ]},
          { "id": "final_confirm", "type": "modal", "title": "Esto no se puede deshacer", "body": "Lo que llegue después del cierre va al período de ajuste. ¿Estás segura?", "confirm_label": "Sí, cerrar el mes" }
        ]
      }
    },
    {
      "id": "SCR-originate-loan",
      "title": "Nuevo préstamo",
      "description": "Loan origination single-screen with member/non-member toggle + guarantor picker + referrer picker + disbursement source per BR-04/05/06 + US-076.",
      "route": "/prestamos/nuevo",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-033", "US-034", "US-035", "US-076"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "borrower_kind_toggle", "type": "form", "fields": [
            { "id": "borrower_kind", "label": "¿A quién es el préstamo?", "type": "select", "options": [{"value": "member", "label": "A una socia"}, {"value": "non_member", "label": "A alguien que no es socia"}] }
          ]},
          { "id": "member_branch", "type": "form", "conditional_on": "borrower_kind == 'member'", "fields": [
            { "id": "borrower_member_id", "label": "Socia", "type": "autocomplete:Member" }
          ]},
          { "id": "non_member_branch", "type": "form", "conditional_on": "borrower_kind == 'non_member'", "fields": [
            { "id": "non_member.display_name", "label": "Nombre", "type": "text", "required": true },
            { "id": "non_member.whatsapp_number", "label": "WhatsApp", "type": "phone" },
            { "id": "non_member.national_id_redacted_tail4", "label": "Últimos 4 de cédula", "type": "text" },
            { "id": "guarantor_member_id", "label": "Socia garante (obligatoria)", "type": "autocomplete:Member", "required": true }
          ]},
          { "id": "terms", "type": "form", "fields": [
            { "id": "principal_amount", "label": "Monto (USD)", "type": "currency", "required": true },
            { "id": "term_periods", "label": "Plazo (meses)", "type": "integer", "required": true },
            { "id": "rate_value", "label": "Tasa (%)", "type": "decimal", "default": ":auto:" },
            { "id": "purpose", "label": "Propósito", "type": "text" },
            { "id": "referrer_member_id", "label": "Socia que refirió (opcional)", "type": "autocomplete:Member" },
            { "id": "disbursement_source", "label": "¿De dónde sale la plata?", "type": "select", "options": ["banco", "caja chica"], "default": "banco" }
          ]},
          { "id": "eligibility_result", "type": "info-banner", "content": ":computed:eligibility_check" },
          { "id": "actions", "type": "action-bar", "actions": [{ "id": "btn_create", "label": "Crear préstamo", "action": "server_action:originateLoan", "navigate_to": "SCR-loan-detail", "kind": "primary" }] }
        ]
      }
    },
    {
      "id": "SCR-public-verify-pdf",
      "title": "Verificar documento",
      "description": "Public no-auth hash verifier per US-085. Supports QR scan or paste.",
      "route": "/verify/[hash]",
      "roles": ["public"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-085"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "verify_input", "type": "form", "fields": [
            { "id": "hash", "label": "Código de verificación", "type": "text", "prefill_from_url": true }
          ], "submit": { "id": "btn_verify", "label": "Verificar", "action": "server_action:verifyHash" } },
          { "id": "result_banner", "type": "info-banner", "content": ":computed:verification_result" },
          { "id": "qr_scan_hint", "type": "info-banner", "content": "También puedes escanear el código QR del PDF." }
        ]
      }
    },
    {
      "id": "SCR-record-base-fund-quota",
      "title": "Registrar cuota base",
      "description": "Annual base-fund quota recording per BR-08 + US-032.",
      "route": "/cuota-base/registrar",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-032"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "info", "type": "info-banner", "content": "La cuota base es independiente de los aportes mensuales y no recibe interés a fin de año." },
          { "id": "form", "type": "form", "fields": [
            { "id": "member_id", "label": "Socia", "type": "autocomplete:Member:pending_quota_this_fiscal_year" },
            { "id": "amount", "label": "Monto (USD)", "type": "currency", "default": ":auto:base_fund_quota_config" },
            { "id": "paid_on", "label": "Fecha", "type": "date", "default": "today" },
            { "id": "slip_photo", "label": "Foto de comprobante (opcional)", "type": "file" }
          ], "submit": { "id": "btn_save", "label": "Guardar cuota", "action": "server_action:collectBaseFundQuota" } }
        ]
      }
    },
    {
      "id": "SCR-record-contribution",
      "title": "Registrar aporte",
      "description": "Deposit recording with payment source per US-074 + slip photo + offline-queue chip per US-077.",
      "route": "/aportes/registrar",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-029", "US-074", "US-077"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "form", "type": "form", "fields": [
            { "id": "member_id", "label": "Socia", "type": "autocomplete:Member", "required": true },
            { "id": "amount", "label": "Monto (USD)", "type": "currency", "required": true },
            { "id": "dated_on", "label": "Fecha", "type": "date", "default": "today" },
            { "id": "payment_source", "label": "¿De dónde viene la plata?", "type": "select", "options": ["banco", "efectivo en reunión", "caja chica"], "default": "banco", "added_per": "US-074" },
            { "id": "slip_photo", "label": "Foto de comprobante", "type": "file", "conditional_required": "payment_source == 'banco'" },
            { "id": "notes", "label": "Notas (opcional)", "type": "textarea" }
          ], "submit": { "id": "btn_save", "label": "Guardar aporte", "action": "server_action:recordContribution", "client_request_id": true } },
          { "id": "offline_chip", "type": "info-banner", "content": ":computed:offline_status", "visible_when": "offline_queue_count > 0" }
        ]
      }
    },
    {
      "id": "SCR-record-repayment",
      "title": "Registrar pago",
      "description": "Repayment with automatic split (interest-first per OQ-BR-06) + overpayment/underpayment/multi-cuota per F47.",
      "route": "/prestamos/[id]/pago",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-036"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "loan_header", "type": "session-header-card" },
          { "id": "form", "type": "form", "fields": [
            { "id": "amount", "label": "Monto recibido (USD)", "type": "currency", "required": true },
            { "id": "dated_on", "label": "Fecha", "type": "date", "default": "today" },
            { "id": "slip_photo", "label": "Foto de comprobante (opcional)", "type": "file" }
          ]},
          { "id": "split_preview", "type": "info-banner", "content": ":computed:split_breakdown" },
          { "id": "edge_cases", "type": "tabs", "tabs": ["Pago normal", "Sobre-pago (excedente)", "Pago parcial", "Varias cuotas"] }
        ]
      }
    },
    {
      "id": "SCR-statements-archive",
      "title": "Estados de cuenta",
      "description": "Statement archive + per-member PDF generation + WhatsApp share per US-048/049 with enriched content per US-086.",
      "route": "/estados",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-048", "US-049", "US-086"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "batch_action", "type": "action-bar", "actions": [{ "id": "btn_batch", "label": "Generar estados del último cierre", "action": "server_action:generateMemberStatementsBatch" }] },
          { "id": "archive_table", "type": "data-table", "columns": ["period", "kind", "member", "generated_at", "hash"], "row_actions": [
            { "id": "btn_preview", "label": "Previsualizar", "action": "modal:pdf_preview" },
            { "id": "btn_share", "label": "Compartir por WhatsApp", "action": "share_intent:whatsapp_pdf" }
          ]}
        ]
      }
    },
    {
      "id": "SCR-treasurer-home",
      "title": "Inicio",
      "description": "Treasurer dashboard with 3 primary action tiles + live A/R aging + alerts bell per US-031 + US-040 + US-058.",
      "route": "/",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-031", "US-040", "US-058"], "change_id": "" },
      "layout": {
        "kind": "page",
        "sections": [
          { "id": "heading", "type": "hero", "title": "¿Qué quieres registrar hoy?" },
          { "id": "primary_actions", "type": "cards-grid", "cards": [
            { "id": "card_record_contribution", "title": "Registrar aporte", "icon": "Wallet", "navigate_to": "SCR-record-contribution", "kind": "primary" },
            { "id": "card_record_repayment", "title": "Registrar pago de préstamo", "icon": "HandCoins", "navigate_to": "SCR-loans-list" },
            { "id": "card_view_arrears", "title": "Ver atrasos", "icon": "AlertCircle", "navigate_to": "SCR-ar-aging" }
          ]},
          { "id": "ar_summary", "type": "ar-aging-list", "limit": 5 },
          { "id": "member_search", "type": "form", "fields": [{ "id": "member_q", "label": "¿Cuánto tiene...?", "type": "autocomplete:Member" }] },
          { "id": "liquidity_tile", "type": "metric-cards", "cards": [{ "id": "liquidity_min", "title": "Mes más bajo proyectado", "value": ":computed:", "navigate_to": "SCR-cash-flow-projection" }] }
        ]
      }
    },
    {
      "id": "SCR-year-end-share-out",
      "title": "Reparto fin de año",
      "description": "Year-end share-out wizard with time-weighted by-source breakdown + 24h reversal grace per US-051/052/053/084.",
      "route": "/reparto",
      "roles": ["tesorera"],
      "meta": { "release": "R1", "owner": "fcostudios__mi-banquito", "stories": ["US-051", "US-052", "US-053", "US-084"], "change_id": "" },
      "layout": {
        "kind": "wizard",
        "sections": [
          { "id": "step1_group_summary", "type": "metric-cards", "cards": [
            { "title": "Interés de préstamos a socias", "value": ":computed:" },
            { "title": "Interés de préstamos a no-socias", "value": ":computed:" },
            { "title": "Comisiones por referidos", "value": ":computed:" },
            { "title": "Total a repartir", "value": ":computed:" }
          ]},
          { "id": "step2_per_member_table", "type": "editable-grid", "columns": [
            "acumulado", "saldo_ponderado_usd_dias", "interes_socios", "interes_no_socios", "comision_referidos", "total_borrador", "ajuste", "total_final", "motivo_ajuste"
          ], "row_editable_columns": ["ajuste", "motivo_ajuste"] },
          { "id": "explanation", "type": "info-banner", "content": "Tu participación es proporcional al tiempo que tu dinero estuvo en el fondo durante el año, no al saldo acumulado." },
          { "id": "a5_gate_banner", "type": "info-banner", "content": ":computed:a5_shortfall_warning", "kind": "warning", "visible_when": "a5_alert_active" },
          { "id": "step3_approve", "type": "action-bar", "actions": [
            { "id": "btn_approve", "label": "Aprobar reparto", "action": "modal:approval_confirm", "kind": "primary" }
          ]},
          { "id": "grace_window_reverse", "type": "action-bar", "actions": [
            { "id": "btn_reverse", "label": "Revertir reparto", "action": "modal:reverse_confirm", "kind": "danger", "visible_when": "within_24h_grace" }
          ]}
        ]
      }
    }
  ]
}
```

---SECTION: SEC07---

### SEC07 — Navigation Map

> See standalone file `Nous/Specs/fcostudios/mi-banquito/v1/07c_navigation_map.json` for the full HR-30 source of truth. Summary follows.

The navigation map is published as `07c_navigation_map.json` per HR-30. It contains: (a) `app_shell.sidebar.items[]` for both `tesorera` role (11 items) and `platform_operator` role (6 items) per `06_design_system.md §SEC4.5`; (b) `routes[]` for all 30 screens; (c) `navigation_graph.nodes + edges` representing every cross-screen action from SEC06; (d) `role_based_views.{tesorera, platform_operator, public}.screens[]` enumerations; (e) `dynamic_route_params{}` per HR-31 for `[id]` and `[hash]` segments.

### SEC08 — Open Questions

None blocking R1. Carry-forward items already in the **R2 Backlog Registry** (`08_scope.md §R2`). Specific Step 7-related items confirmed at the design-partner walkthrough:
- F50 — vocabulary toggle (`socia` vs `aportante`) per group (R2-UX-01)
- F51 — rename "Liquidez proyectada" if too "banky" (R2-UX-02)
- F52 — time-weighted explanation copy in es-EC for `SCR-year-end-share-out` step 2 narrative banner (already addressed via `step2_per_member_table.explanation`)
- F46 — cédula + emergency contact in `SCR-add-member` form (added)

### SEC09 — Coverage Justification

**No screen is shared between `tesorera` and `platform_operator` roles.** The two-surface model per `06_design_system §SEC1` is enforced by route group: `app/(treasurer)/*` and `app/(admin)/*` ship from the same component library but never share screen IDs. The single exception is the read-only impersonation pattern (US-020): operator views *any* tenant screen with `app.current_org` switched + a pinned banner; this is not a screen of its own, it's a runtime visual marker. The public verifier `SCR-public-verify-pdf` is the only screen with role `public` — no auth, rate-limited, single-purpose.

Every persona has explicit screen coverage:
- `tesorera` — 19 dedicated screens covering S1..S6 + cross-cutting (home, alerts bell embedded in header, history, group config, first-run wizard).
- `platform_operator` — 11 dedicated screens covering PA-S1..PA-S7 + business-rules panel + cron-runs + pilot log.
- `public` — 1 dedicated screen (verifier).
- `presidente` and `miembro` — no app screens R1; consume PDF artifacts via WhatsApp + may use the verifier.

Every business process from SEC03 has at least one dedicated screen. Every transaction kind (`aporte`, `retiro`, `pago de préstamo`, `gasto del grupo`, `cuota base`, `comisión por referido`, `compensación de tesorera`) has either a dedicated record-flow screen or appears explicitly in `SCR-history` filterable by kind.

---

## EOY + Multi-group screen delta (CHG-002..008)

Screen count **34 → 36** (see `07c_navigation_map.json`).

**New screens:**
- **`SCR-balance-banquito`** (`/balance`) — `BALANCE BANQUITO al 31/dic` balance sheet (ACTIVOS = PASIVOS), derived from the immutable year-end snapshot + surplus; PDF export. Sidebar item `nav-balance`. (CHG-007 / US-118 / BR-24)
- **`SCR-group-picker`** (`/grupos`) — choose the active banquito when a treasurer manages several; **not** a sidebar destination (pre-shell landing; auto-skipped for single-group users). (CHG-008 / US-124 / BR-25)

**Changed screens:**
- `SCR-year-end-share-out` — rebuilt **two-pool** (loan-bonus + savings-interest columns) + a **step-0 Assembly governance** card + per-member **disposition** (withdraw/retain) columns. (CHG-004/005)
- `SCR-loan-detail` + `SCR-ar-aging` — mora accrual line/column + repayment split. (CHG-002)
- `SCR-group-config` — per-group mora config card. (CHG-002)
- `SCR-statements-archive` — year-end snapshot + economic-summary PDF kinds; point-in-time entry. (CHG-003/007)
- `SCR-accounts` — account product-type + institution columns/fields. (CHG-006)

**Shell:** the **IMP-229** active-context chip (group switcher, from `app_shell.header.active_context`) renders on every screen; the **IMP-228** overflow "More" menu carries the expanded sidebar (now incl. `nav-balance`).

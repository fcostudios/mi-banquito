# 10 — Implementation Plan (Plan de Implementación)

> **Mi Banquito · R1** · Generado por el Agente de Planificación (Step 10) · `es-EC` · Metodología **Scrum**, sprints de **2 semanas** · Equipo asumido: **1-2 FTE** (un ingeniero full-stack TypeScript que cubre FE + BE + DevOps).
>
> Este plan **secuencia** las 99 historias ya decididas en el Step 08 (US-001..US-099) en sprints. No re-descompone ni renumera: cada `US-NNN` / `FEAT-NNN` se preserva literal. El Step 10b expande cada historia en su ficha de implementación usando la asignación de sprint de este plan.

## SEC0 — Resumen Ejecutivo

R1 de Mi Banquito se entrega en **9 sprints de construcción (S0-S8)** más un sprint de seguimiento **S9** para la regularización de movimientos de fondos (CHG-001). Total: **99 historias**, **352 puntos de historia**, ~**18-20 semanas** para el MVP. El enfoque es **fundación primero**: el Sprint 0 provisiona toda la infraestructura y el andamiaje del monorepo antes de cualquier trabajo de funcionalidad, de modo que el equipo de desarrollo pueda construir contra un entorno real (DB, auth, CI/CD, PWA) desde el Sprint 1.

**Definición de "hecho" del MVP:** la tesorera del banquito piloto registra aportes, origina y cobra préstamos, concilia contra banco y cierra el mes en < 30 minutos, sobre un substrato multi-tenant con RLS, ledger append-only y auditoría — todo desplegado en Vercel + Neon por < $30/mes.

## SEC4 — Enfoque de Entrega y Longitud de Sprint

Se recomienda **Scrum con sprints de 2 semanas** (frente a 1 semana): con un único desarrollador, el overhead ceremonial de sprints semanales no se justifica y los entregables de infra/dominio (engine de préstamos, share-out) no caben en una semana. Demos quincenales con la socia de diseño (la madre del fundador) sirven como gate de validación continua.

**Fundación primero (tu énfasis explícito en infra):** el **Sprint 0** es exclusivamente las 15 historias de aprovisionamiento (Epic 0) — monorepo Turborepo, Vercel, Neon con branching por preview, Auth0 Organizations, Drizzle con las 29 tablas + RLS + triggers append-only, Tailwind 4 + design tokens, Serwist PWA, middleware de auth + RLS session var, Vercel Cron, pipeline CI, infra de tests de reglas de negocio, y magic-link. Ninguna historia de funcionalidad comienza hasta que S0 cierra.

## SEC11 — Plan de Releases y Milestones

| Milestone | Sprints | Objetivo | Criterio de salida |
|---|---|---|---|
| **M0 — Fundación lista** | S0 | Entorno + andamiaje provisionados | `pnpm build` verde, migración inicial aplicada, preview deploy vivo, auth magic-link funciona |
| **M1 — Substrato tenant** | S1-S2 | Ciclo de vida de org + onboarding + ciclo de aportes | Tesorera registra aportes con foto; estado de cumplimiento por miembro visible |
| **M2 — Motor financiero** | S3-S5 | Préstamos + cobros + liquidez + conciliación | Cierre mensual con cero discrepancia ledger-vs-banco en entorno de prueba |
| **M3 — Reportes + cierre anual** | S6-S7 | Estados de cuenta + share-out + alertas | PDF de cierre generado < 2s; share-out de fin de año con reversión |
| **M4 — Admin + observabilidad** | S8 | Slice de admin de plataforma + drift | Operador corre ciclo de vida de org desde `/admin`; drift visible |
| **R1 follow-up (CHG-001)** | S9 | Movimientos de fondos + multi-cuenta + solidaridad | Regularización de depósitos en cuentas no-grupo; colecta solidaria |

## SEC12 — Plan de Sprints (asignación de historias)

### S0 — Foundation & Infra Provisioning
*15 historias · 84 SP · migraciones V001-V015*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-001 | FEAT-001 | Infra | 5 | Initialize Turborepo monorepo with apps/web and 5 packages |
| US-002 | FEAT-002 | Infra | 5 | Provision Vercel project with custom domain and preview deploys |
| US-003 | FEAT-003 | Infra | 5 | Provision Neon project with branching per Vercel preview |
| US-004 | FEAT-004 | Infra | 5 | Provision Auth0 tenant with Organizations and FcoStudios org |
| US-005 | FEAT-005 | Infra | 5 | Provision Vercel Blob store and Sentry project and Better Stack monitor |
| US-006 | FEAT-006 | Infra | 5 | Configure environment variables for local preview and prod |
| US-007 | FEAT-007 | Infra | 5 | Set up Next.js 16 App Router with treasurer and admin route groups |
| US-008 | FEAT-008 | Infra | 8 | Set up Drizzle initial migration with 29 entity tables RLS triggers materialized views |
| US-009 | FEAT-009 | Infra | 5 | Set up Tailwind 4 with design tokens and strings.es-EC.json and Lucide allow-list |
| US-010 | FEAT-010 | Infra | 5 | Set up Serwist service worker and PWA manifest installable Android and iOS |
| US-011 | FEAT-011 | Infra | 8 | Set up auth middleware Auth0 session extraction and Postgres RLS session var |
| US-012 | FEAT-012 | Infra | 5 | Set up Vercel Cron config for daily interest and treasurer compensation and drift sweep |
| US-013 | FEAT-013 | Infra | 8 | Set up CI pipeline type-check lint test Drizzle migration check axe a11y |
| US-014 | FEAT-014 | Infra | 5 | Set up business-rule test infrastructure golden files property-based |
| US-015 | FEAT-015 | Infra | 5 | Set up Auth0 magic-link passwordless email flow |

### S1 — Platform Lifecycle + Tenant Onboarding
*10 historias · 29 SP · migraciones V016-V030*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-016 | FEAT-016 | Platform | 3 | Platform operator creates a new tenant organization |
| US-017 | FEAT-017 | Platform | 2 | Platform operator configures group rules including 11 business rules |
| US-025 | FEAT-025 | Tenant onboarding | 5 | Treasurer first-run group setup wizard 3 screens |
| US-026 | FEAT-026 | Tenant ledger | 3 | Treasurer adds a member with name WhatsApp number role initial savings |
| US-027 | FEAT-027 | Tenant ledger | 3 | Treasurer changes a member status to en pausa or baja with refund A/P entry |
| US-028 | FEAT-028 | Tenant config | 2 | Treasurer views and edits group rules read-only first then edits with HR-1 versioning |
| US-029 | FEAT-029 | Tenant ledger | 3 | Treasurer records a contribution with slip photo and optional notes |
| US-030 | FEAT-030 | Tenant ledger | 3 | Treasurer reverses a prior contribution with required reason |
| US-031 | FEAT-031 | Tenant ledger | 2 | Treasurer views live compliance state per member with green amber red encoding |
| US-032 | FEAT-032 | Tenant ledger | 3 | Treasurer records the annual base fund quota payment for a member |

### S2 — Contribution Cycle (Ledger)
*10 historias · 41 SP · migraciones V031-V045*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-033 | FEAT-033 | Tenant loans | 5 | Treasurer originates a member loan declining-balance schedule auto-generated |
| US-034 | FEAT-034 | Tenant loans | 5 | Treasurer originates a non-member loan with required guarantor picker |
| US-035 | FEAT-035 | Tenant loans | 5 | Treasurer optionally designates a referrer member on origination |
| US-036 | FEAT-036 | Tenant loans | 5 | Treasurer records a loan repayment with auto split interest first |
| US-037 | FEAT-037 | Tenant loans | 5 | Treasurer views loan detail with schedule fees repayments accruals referrer guarantor |
| US-038 | FEAT-038 | Backstage interest | 3 | System fires daily interest accrual cron idempotent on loan_id and accrued_on |
| US-039 | FEAT-039 | Backstage loans | 5 | System fires referral commission credit on Loan status pagado |
| US-074 | REVIEW_F3 | review/chg | 3 | Treasurer records a contribution as cash, bank, or petty cash |
| US-075 | REVIEW_F4 | review/chg | 3 | System supports a "partial aporte" state and treasurer records partial payments |
| US-081 | REVIEW_F20 | review/chg | 2 | Operator views cron run history and triggers manual replay |

### S3 — Loan Lifecycle + Money-Flow Realism
*10 historias · 32 SP · migraciones V046-V060*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-024 | FEAT-024 | Platform | 2 | Platform operator views per-org business-rules panel |
| US-055 | FEAT-055 | Tenant alerts | 2 | Treasurer views and acts on the alerts bell with dismiss snooze and Avisar |
| US-056 | FEAT-056 | Tenant audit | 2 | Treasurer views Historial as plain-Spanish audit narration |
| US-057 | FEAT-057 | Tenant audit | 3 | Treasurer searches Historial by member kind and date range |
| US-069 | FEAT-069 | Substrate | 3 | System enforces append-only ledger via Postgres row triggers |
| US-070 | FEAT-070 | Substrate | 3 | System enforces period-lock immutability via Postgres row trigger |
| US-071 | FEAT-071 | Substrate | 3 | System enforces audit-write-failure rollback via same-transaction pattern |
| US-072 | FEAT-072 | Substrate | 8 | System enforces cross-tenant safety via Postgres RLS plus auth session var |
| US-073 | FEAT-073 | Observability | 3 | System captures errors with PII redaction in Sentry |
| US-083 | REVIEW_F11 | review/chg | 3 | Operator opens an adjustment period after a locked monthly close |

### S4 — Collections + Liquidity
*10 historias · 29 SP · migraciones V061-V075*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-040 | FEAT-040 | Tenant collections | 2 | Treasurer views the A R aging primary tab sorted by days late descending |
| US-041 | FEAT-041 | Tenant collections | 3 | Treasurer marks a promise on a late row with a date |
| US-042 | FEAT-042 | Tenant collections | 3 | Treasurer shares a chase message via WhatsApp from a late row |
| US-043 | FEAT-043 | Backstage alerts | 2 | System surfaces promise on the promised date as a reminder |
| US-050 | FEAT-050 | Backstage reporting | 3 | System awards treasurer compensation per cron with idempotency |
| US-054 | FEAT-054 | Tenant liquidity | 2 | Treasurer views Liquidez Proyectada single screen with sandbox |
| US-076 | REVIEW_F7 | review/chg | 5 | Treasurer declares loan disbursement source (bank vs cash) at origination |
| US-077 | REVIEW_F6 | review/chg | 3 | PWA visibly shows "guardado, esperando señal" when a write is queued offline |
| US-085 | REVIEW_F24 | review/chg | 3 | Public statement-verifier endpoint accepts hash + returns "matches / does not ma |
| US-087 | REVIEW_F40 | review/chg | 3 | Operator runs the design-partner onboarding ceremony with parity-check log |

### S5 — Reconciliation + Monthly Close
*10 historias · 28 SP · migraciones V076-V090*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-044 | FEAT-044 | Tenant reconciliation | 3 | Treasurer enters declared bank balance and sees discrepancy in cierre flow |
| US-045 | FEAT-045 | Tenant reconciliation | 3 | Treasurer annotates a discrepancy outside tolerance with required reason |
| US-046 | FEAT-046 | Tenant reconciliation | 3 | Treasurer locks the monthly close and the period becomes immutable |
| US-047 | FEAT-047 | Backstage reporting | 3 | System generates the monthly close PDF with canonical-JSON SHA-256 hash |
| US-060 | FEAT-060 | (artifact only) | 3 | President receives monthly close PDF via WhatsApp from treasurer |
| US-067 | FEAT-067 | Backstage alerts | 2 | System emits A7 discrepancia bancaria detectada alert |
| US-079 | REVIEW_F18 | review/chg | 3 | Operator bootstraps the FcoStudios platform organization |
| US-080 | REVIEW_F19 | review/chg | 3 | Operator freezes or archives a tenant organization with audit trail |
| US-086 | REVIEW_F21_F22_F23_F52 | review/chg | 3 | Per-member statement PDF + year-end PDF explain content richly |
| US-088 | POST_REVIEW_A8_period_not_closed | review/chg | 2 | System emits A8 *Período no cerrado en últimos N días* (Medium, treasurer + plat |

### S6 — Reporting + Statements + Alerts
*10 historias · 36 SP · migraciones V091-V105*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-048 | FEAT-048 | Tenant reporting | 3 | Treasurer generates per-member statements as a batch and individually |
| US-049 | FEAT-049 | Tenant reporting | 3 | Treasurer shares a statement via WhatsApp share intent |
| US-051 | FEAT-051 | Tenant reporting | 8 | Treasurer opens year-end share-out wizard with time-weighted breakdown by source |
| US-052 | FEAT-052 | Tenant reporting | 3 | Treasurer overrides a per-member share with required reason and audit |
| US-053 | FEAT-053 | Tenant reporting | 8 | Treasurer approves year-end share-out which writes payouts and PDFs |
| US-058 | FEAT-058 | Tenant ledger | 2 | Treasurer views balance for any member via partial-name search on home |
| US-059 | FEAT-059 | (artifact only) | 3 | Member receives statement via WhatsApp from treasurer |
| US-061 | FEAT-061 | Backstage alerts | 2 | System emits A1 conciliacion pendiente alert |
| US-062 | FEAT-062 | Backstage alerts | 2 | System emits A2 prestamo proximo a vencer alert |
| US-063 | FEAT-063 | Backstage alerts | 2 | System emits A3 aporte atrasado alert |

### S7 — Year-End Share-Out + Alert Emitters
*10 historias · 29 SP · migraciones V106-V120*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-018 | FEAT-018 | Platform | 3 | Platform operator invites the treasurer via Auth0 organization invite |
| US-064 | FEAT-064 | Backstage alerts | 2 | System emits A4 liquidez bajo margen alert |
| US-065 | FEAT-065 | Backstage alerts | 2 | System emits A5 compromiso reparto excede proyeccion alert |
| US-066 | FEAT-066 | Backstage alerts | 2 | System emits A6 prestamo en mora alert |
| US-068 | FEAT-068 | Backstage alerts | 2 | System emits A14 saldo de miembro negativo alert |
| US-078 | REVIEW_F5 | review/chg | 3 | Treasurer marks a chase-promise with date + receives a reminder |
| US-082 | REVIEW_F36 | review/chg | 3 | Operator re-issues a magic-link from /admin when treasurer cannot log in |
| US-084 | REVIEW_F8 | review/chg | 8 | Treasurer reverses an approved year-end share-out within grace window |
| US-089 | POST_REVIEW_A9_config_changed | review/chg | 2 | System emits A9 *Cambio de configuración del grupo* (Low, treasurer) |
| US-090 | POST_REVIEW_A11_no_slip_n_consecutive | review/chg | 2 | System emits A11 *Aporte sin foto de comprobante (≥ N consecutivos)* (Low, treas |

### S8 — Platform Admin + Substrate Observability
*10 historias · 32 SP · migraciones V121-V135*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-019 | FEAT-019 | Platform | 2 | Platform operator views per-org health snapshot on admin home |
| US-020 | FEAT-020 | Platform | 3 | Platform operator starts read-only impersonation with required reason |
| US-021 | FEAT-021 | Platform | 3 | Platform operator exports tenant data as ZIP with CSVs PDFs manifest |
| US-022 | FEAT-022 | Platform | 2 | Platform operator views audit bitacora across orgs with dense filters |
| US-023 | FEAT-023 | Platform | 2 | Platform operator views substrate drift status and last-check timestamp |
| US-091 | FEAT-CHG001-01 | review/chg | 3 | Treasurer sets up and manages the group's accounts |
| US-092 | FEAT-CHG001-02 | review/chg | 3 | Treasurer records a categorized fund movement (fee / supplies / shared expense) |
| US-093 | FEAT-CHG001-03 | review/chg | 3 | Treasurer records an inter-account transfer (bookkeeping) |
| US-094 | FEAT-CHG001-04 | review/chg | 3 | Treasurer regularizes a deposit that landed in a non-group account *(crown jewel |
| US-095 | FEAT-CHG001-05 | review/chg | 8 | Period close blocks while unregularized movements exist (reconciliation panel) |

### S9 — Fund-Movement Regularization (CHG-001)
*4 historias · 12 SP · migraciones V136-V150*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-096 | FEAT-CHG001-06 | review/chg | 3 | Treasurer starts an extraordinary / solidarity collection |
| US-097 | FEAT-CHG001-07 | review/chg | 3 | Treasurer records a solidarity payout and closes the collection |
| US-098 | FEAT-CHG001-08 | review/chg | 3 | Treasurer records a treasurer-compensation payout gated by a recognized amount |
| US-099 | FEAT-CHG001-09 | review/chg | 3 | Statements, cash-flow, and public-verify reflect all movements net + collections |

## SEC13 — Línea de Tiempo (Timeline)

Duración total estimada del MVP (S0-S8): **18-20 semanas**; con S9 (CHG-001): ~**20-22 semanas**. Conductor crítico: el motor de préstamos (S3) y la conciliación (S5) son los bloques de mayor riesgo/esfuerzo.

<svg viewBox="0 0 1220 430" xmlns="http://www.w3.org/2000/svg" data-nous-timeline="true" role="img" aria-label="Línea de tiempo de sprints S0 a S9 para Mi Banquito R1">
  <style>text{font-family:system-ui,sans-serif} .t{font-size:13px;font-weight:600;fill:#1a2b3c} .n{font-size:11px;fill:#5a6b7c} .c{font-size:11px;fill:#2563eb;font-weight:600}</style>
  <rect x="40" y="40" width="96" height="260" rx="6" fill="#2563eb" opacity="0.85"/>
  <text class="t" x="40" y="320">S0</text>
  <text class="c" x="40" y="32">15h · 84SP</text>
  <text class="n" x="40" y="338">V001-V015</text>
  <text class="n" x="40" y="356">Foundation &</text>
  <text class="n" x="40" y="370">Infra Provisioning</text>
  <rect x="158" y="185" width="96" height="115" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="158" y="320">S1</text>
  <text class="c" x="158" y="177">10h · 29SP</text>
  <text class="n" x="158" y="338">V016-V030</text>
  <text class="n" x="158" y="356">Platform Lifecycle</text>
  <text class="n" x="158" y="370">+ Tenant Onboarding</text>
  <rect x="276" y="153" width="96" height="147" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="276" y="320">S2</text>
  <text class="c" x="276" y="145">10h · 41SP</text>
  <text class="n" x="276" y="338">V031-V045</text>
  <text class="n" x="276" y="356">Contribution Cycle</text>
  <text class="n" x="276" y="370">(Ledger)</text>
  <rect x="394" y="177" width="96" height="123" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="394" y="320">S3</text>
  <text class="c" x="394" y="169">10h · 32SP</text>
  <text class="n" x="394" y="338">V046-V060</text>
  <text class="n" x="394" y="356">Loan Lifecycle</text>
  <text class="n" x="394" y="370">+ Money-Flow Realism</text>
  <rect x="512" y="185" width="96" height="115" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="512" y="320">S4</text>
  <text class="c" x="512" y="177">10h · 29SP</text>
  <text class="n" x="512" y="338">V061-V075</text>
  <text class="n" x="512" y="356">Collections +</text>
  <text class="n" x="512" y="370">Liquidity</text>
  <rect x="630" y="187" width="96" height="113" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="630" y="320">S5</text>
  <text class="c" x="630" y="179">10h · 28SP</text>
  <text class="n" x="630" y="338">V076-V090</text>
  <text class="n" x="630" y="356">Reconciliation +</text>
  <text class="n" x="630" y="370">Monthly Close</text>
  <rect x="748" y="166" width="96" height="134" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="748" y="320">S6</text>
  <text class="c" x="748" y="158">10h · 36SP</text>
  <text class="n" x="748" y="338">V091-V105</text>
  <text class="n" x="748" y="356">Reporting +</text>
  <text class="n" x="748" y="370">Statements + Alerts</text>
  <rect x="866" y="185" width="96" height="115" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="866" y="320">S7</text>
  <text class="c" x="866" y="177">10h · 29SP</text>
  <text class="n" x="866" y="338">V106-V120</text>
  <text class="n" x="866" y="356">Year-End Share-Out</text>
  <text class="n" x="866" y="370">+ Alert Emitters</text>
  <rect x="984" y="177" width="96" height="123" rx="6" fill="#10b981" opacity="0.85"/>
  <text class="t" x="984" y="320">S8</text>
  <text class="c" x="984" y="169">10h · 32SP</text>
  <text class="n" x="984" y="338">V121-V135</text>
  <text class="n" x="984" y="356">Platform Admin</text>
  <text class="n" x="984" y="370">+ Substrate Observability</text>
  <rect x="1102" y="229" width="96" height="71" rx="6" fill="#f59e0b" opacity="0.85"/>
  <text class="t" x="1102" y="320">S9</text>
  <text class="c" x="1102" y="221">4h · 12SP</text>
  <text class="n" x="1102" y="338">V136-V150</text>
  <text class="n" x="1102" y="356">Fund-Movement Regularization</text>
  <text class="n" x="1102" y="370">(CHG-001)</text>
  <text class="t" x="40" y="400">Mi Banquito R1 — 99 historias · 352 SP · sprints de 2 semanas · 1 desarrollador</text>
</svg>


## SEC5b — Matriz de Cobertura de Reglas de Negocio (BR Coverage Guarantee)

> Garantía original (clon de la garantía de cobertura de NFR): **cada una de las 11 reglas base de negocio está cubierta por ≥1 historia**. Las historias que tocan una entidad gobernada por una BR declaran esa BR en su fila `Business Rules` del Meta (Step 10b), materializada como arista `governed_by` en `nous.db` (IMP-223). Reglas posteriores de feedback piloto se agregan como deltas y deben recibir historia implementadora antes de cerrarse.

| BR | Regla | Capa | Historias que la implementan | Sprint(s) |
|---|---|---|---|---|
| BR-01 | Declining-balance interest method | 2 | US-033, US-036, US-037 | S2 |
| BR-02 | Configurable rate and period | 2 | US-028, US-033 | S1, S2 |
| BR-03 | Admin fee on first installment | 2 | US-036, US-037 | S2 |
| BR-04 | Member vs non-member rate bands | [1, 2] | US-033, US-034 | S2 |
| BR-05 | Non-member loans require member guarantor | 1 | US-034 | S2 |
| BR-06 | Referral commission (fixed flat per loan paid at full payoff) | [1, 2, 3] | US-039 | S2 |
| BR-07 | Treasurer compensation (fixed periodic R1; extensible R2) | 3 | US-098, US-050 | S4, S9 |
| BR-08 | Base fund as annual per-member quota | [1, 3] | US-032 | S1 |
| BR-09 | Time-weighted interest on savings for share-out | 2 | US-051, US-053 | S6 |
| BR-10 | Fiscal year configuration | 2 | US-028, US-051 | S1, S6 |
| BR-11 | Treasurer-overridable share-out with breakdown by source | 2 | US-052, US-053 | S6 |
| BR-26 | Member payment allocation waterfall: loan mora/fees, loan interest, loan principal, overdue aportes, current aporte, then one-tap extra decision | 2 | US-100 substrate intake; implementation story pending | S10+ |

**Cobertura base:** 11/11 reglas base con ≥1 historia implementadora. **Delta piloto:** BR-26 queda registrado como intake de substrate en US-100; falta crear/asignar su historia implementadora. Las reglas BR-05 y BR-06 tienen aristas `enforces` a `entity_Loan`/`entity_Withdrawal`, por lo que el ready-check `118_business_rule_coverage.py` exige que toda historia que toque esas entidades declare la BR correspondiente; el resto se verifica por la vía de aristas `governed_by` (drift `[Business Rule Coverage]`).

## SEC19 — Notas de Validación de Estructura

- **Cobertura de IDs:** las 99 historias US-001..US-099 del Step 08 están asignadas, cada una a **exactamente un** sprint. Cero historias inventadas, renumeradas o eliminadas (verificado programáticamente).
- **Desviación del tier de sizing:** el perfil de Research marcó tier **S** (rango 15-30 historias); el backlog real tiene 99 porque el scope del Step 08 ya estaba decompuesto a ese nivel de granularidad (14 epics, incluyendo Epic 0 de infra y Epic 15 de CHG-001). Se preserva el conteo autoritativo del scope, no el heurístico.
- **Rangos de migración pre-asignados** por sprint (V001-V015 para S0, +15 por sprint) para evitar colisiones Flyway/Drizzle en desarrollo paralelo.
- **`json_data.sprint` se poblará en el Step 10b**, cuando las fichas de historia lleven su fila `Sprint N` en el Meta; tras hidratar, el grafo de sprints (IMP-222, first-class) materializará los FKs `artifacts.sprint_id` + aristas `belongs_to_sprint`.

<!-- EOY-SPRINTS-S10-S12 -->

### S10 — EOY Config Substrate + Mora + Year-End Cut
*7 historias · 30 SP · migraciones timestamp-slug (HR-25) · CHG-002/003 (spec_rebaseline)*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-100 | — | EOY | 8 | BR config substrate + resolution contract |
| US-101 | — | EOY | 5 | Formalize LoanFee + GroupConfig.config.mora (migration) |
| US-102 | — | EOY | 3 | System accrues a mora fee on overdue installments (BR-17) |
| US-103 | — | EOY | 3 | Mora fee shown in loan detail, repayment split, A/R aging |
| US-104 | — | EOY | 3 | Mora config editable in group rules |
| US-105 | — | EOY | 5 | Year-end cut: immutable YearEndBalanceSnapshot (BR-18) |
| US-108 | — | EOY | 3 | Year-end snapshot reconciliation guard |

### S11 — Surplus & Two-Pool Reparto + Preservation
*9 historias · 36 SP · migraciones timestamp-slug (HR-25) · CHG-003/004/005 (spec_rebaseline)*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-106 | — | EOY | 3 | Saldos iniciales roll-forward (cxc_anterior) |
| US-107 | — | EOY | 3 | Year-end snapshot exported as immutable PDF |
| US-109 | — | EOY | 3 | Year-end snapshot queryable any time later |
| US-110 | — | EOY | 8 | Distributable surplus + two-pool reparto engine (BR-19/21) |
| US-111 | — | EOY | 3 | Surplus governance decision (BR-20, versioned) |
| US-112 | — | EOY | 5 | Two-pool share-out lines (loan bonus C + savings interest) |
| US-113 | — | EOY | 3 | Reconciliation of reparto vs distributable surplus (BR-22) |
| US-114 | — | EOY | 5 | Reparto run lifecycle (status + locked) |
| US-115 | — | EOY | 3 | Year-end distribution disposition: payout vs retain (BR-23) |

### S12 — Year-End Reporting + Accounts + Multi-Group
*10 historias · 40 SP · migraciones timestamp-slug (HR-25) · CHG-006/007/008 (spec_rebaseline)*

| Historia | Feature | Dominio | SP | Título |
|---|---|---|---|---|
| US-116 | — | EOY | 5 | Accounts enrichment: product_type + institution |
| US-117 | — | EOY | 3 | Country + Institution seed + admin (R3 surface) |
| US-118 | — | EOY | 5 | BALANCE BANQUITO balance sheet + screen (BR-24) |
| US-119 | — | EOY | 3 | Year-end economic summary statement |
| US-120 | — | EOY | 3 | Year-end reporting archive + verification |
| US-121 | — | EOY | 5 | Multi-group: additional group for existing treasurer |
| US-122 | — | EOY | 5 | Active-group resolution + cross-group isolation (BR-25) |
| US-123 | — | EOY | 3 | Group picker screen + active-context switch |
| US-124 | — | EOY | 3 | Per-group config isolation |
| US-125 | — | EOY | 5 | Onboard additional group + switch active context |

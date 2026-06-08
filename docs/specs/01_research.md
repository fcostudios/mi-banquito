# 01 — Research: Treasury Management for Informal Community Savings & Lending Groups

**Project:** Mi Banquito (`fcostudios__mi-banquito`)
**Step:** 1 — Research
**Date:** 2026-05-28
**Author:** Francisco Lomas (via Nous pipeline, `prompts/research.md`)
**Report language:** English (en-US) — substrate convention; product UI ships es-EC
**PRIOR_WORK:** `Nous/Specs/fcostudios/mi-banquito/PRODUCT_BRIEF.md`

### Inputs

| Variable | Value |
|---|---|
| `PROCESS_NAME` | Treasury management for an informal community savings & lending group ("banquito" / "caja" / "tanda") |
| `ORGANIZATION_NAME` | FcoStudios — *Mi Banquito*. First design partner: an active banquito in Ecuador (treasurer = founder's mother). |
| `INDUSTRY_OR_TYPE` | Informal micro-finance / closed-group savings & lending / ROSCA (Rotating Savings & Credit Association) and ASCA (Accumulating Savings & Credit Association) variants. |
| `COUNTRY_REGION` | Ecuador (es-EC), USD economy. R3+ expansion target: broader LATAM. |
| `PROCESS_GOAL` | Replace paper/Excel/memory with a trustworthy phone-first digital ledger so the treasurer can close the month in under 30 minutes with zero ledger-vs-bank discrepancy. |
| `KNOWN_SYSTEMS` | Paper notebooks, Microsoft Excel, WhatsApp (deposit-slip photos + messaging), the group's bank account. |
| `KNOWN_CONSTRAINTS` | Non-technical treasurer; phone-first; intermittent 3G; Spanish-first (es-EC); bootstrapped budget; stay below "regulated financial institution" threshold; USD-only R1 but multi-currency-ready data model; multi-tenant from day 1. |
| `REPORT_LANGUAGE` | en-US |
| `ADDITIONAL_NOTES` | See `PRODUCT_BRIEF.md`. |

---

## [0] Executive Summary

**Process.** A group's treasurer manages the books for an informal community savings-and-lending association. The group pools regular contributions (weekly or monthly), grants short-term loans to members under self-defined rules, accrues interest, tracks repayments, reconciles to a single shared bank account, and produces a monthly close. The cycle repeats indefinitely and trust is the operating system.

**Why it matters to *Mi Banquito*.** This process is the daily reality of millions of LATAM households who have no equivalent formal banking option, or who choose the closed-group model because it is faster, cheaper, and culturally trusted. The first design partner — a real Ecuadorian banquito of ~20 members run by the founder's mother — represents the modal user with high precision: a non-technical treasurer running her group from a phone, with a paper notebook, an Excel sheet she does not fully trust, and WhatsApp as the channel for everything member-facing.

**Key insights about the current situation.**

1. **The process is universally hand-operated.** The dominant tool stack is *paper + Excel + WhatsApp + bank app*. No purpose-built software exists at the closed-group informal tier; the cooperative-software market starts at the formal SEPS-registered cooperative level and assumes regulatory infrastructure these groups do not have and intentionally avoid.
2. **Trust is the product.** A single arithmetic error, a single "lost" transaction, or a single contested balance can dissolve a group built over years. Every UX decision has to be evaluated against the social-trust impact, not just the user-experience impact.
3. **The treasurer is the single point of failure.** One non-technical person carries the cognitive, financial, and reputational risk for the entire group. Most of the pain in the process is concentrated on this one role.
4. **WhatsApp is not going away.** Members will continue to send deposit slips, ask balance questions, and receive statements via WhatsApp. A successful product complements WhatsApp; it does not try to replace it.
5. **Reconciliation is the litmus test.** The single most distinguishing question between a trustworthy and an untrustworthy group ledger is: *"Does it reconcile to the bank balance every month?"* Most informal groups never perform this check at all.

**Key recommendations.**

1. **Ship a phone-first PWA admin console targeting the treasurer.** Spanish-first (es-EC R1), USD-only R1, multi-tenant data model from day 1, multi-currency-ready code paths from day 1.
2. **Make the monthly bank reconciliation a first-class workflow** (not a report). The closeness-to-zero of the discrepancy is the product's main proof of trust.
3. **Make the ledger append-only.** Corrections are reversal entries, never destructive edits. Every transaction has a permanent audit row.
4. **Defer member-side UX entirely in R1** (WhatsApp-only). The R1 deliverable is the treasurer's console plus PDF statement export. Member self-service is R2+.
5. **Stay below the "regulated financial institution" threshold by explicit product framing** (closed-group internal record-keeping, not consumer lending or deposit-taking). Surface this framing in ToS and onboarding copy.

**Expected business impact.** The headline metric is monthly-close time reduced from *several hours of paper-and-Excel work* to *under 30 minutes*. The trust metric is *100% of months reconciling to zero discrepancy by month 3 post-launch*. The substrate metric is *< 1 day to onboard a second organization* when one is committed, which validates Mi Banquito as multi-tenant SaaS and not a single-tenant tool wearing SaaS clothing.

---

## [1] Business Context and Objectives

### 1.1 Organization and Industry Context

**FcoStudios — Mi Banquito.** FcoStudios is a bootstrapped indie product studio operated by Francisco Lomas. Mi Banquito is FcoStudios' first greenfield product hosted on the Nous pipeline (the platform on which this brief, this research, and all downstream artifacts are produced). Team: solo. IT maturity: startup / digital-native (the operator is the engineer). Operating capital: founder's time + nominal hosting cost (target < $30/month for R1). Geographic footprint: founder is based at the convenience of remote work; first user is in Ecuador.

**Target industry — informal community banking / ROSCAs in LATAM.**

The closed-group savings and lending pattern is one of the world's oldest financial primitives, present in every major developing economy under different names: *tanda* (Mexico), *cundina* (Mexico, northern variant), *junta* / *pasanaku* (Peru, Bolivia), *natilla* (Colombia), *partner* (Caribbean), *susu* (West Africa, Caribbean diaspora), *banquito* / *caja* (Ecuador, Andes), *chama* (Kenya), *kye* (Korea), *hui* (China, Taiwan), *tontine* (West Africa, France). Academically, two main shapes are recognized:

- **ROSCAs** (Rotating Savings & Credit Associations): each cycle, every member contributes a fixed amount; the pot rotates to one member per cycle. Pure ROSCAs do not pay interest and do not accumulate balances.
- **ASCAs** (Accumulating Savings & Credit Associations): contributions accumulate in a common fund; the fund is used to issue loans to members; interest is accrued; balances persist between cycles; some groups distribute the accumulated fund + interest at year-end ("share-out").

The product target — *banquitos / cajas* in Ecuador and Andean LATAM — is an ASCA. Each member has a persistent savings balance, loans are issued from the common pool, interest is accrued on outstanding loans, and (sometimes) on member savings, and there is an annual or semi-annual share-out. This pattern is more sophisticated than pure ROSCA and creates a non-trivial recordkeeping burden — which is exactly the gap Mi Banquito addresses.

**Ecuador context (verified pattern-level; specific regulatory citations should be confirmed in the legal review step):**

- Ecuador's economy is officially dollarized (USD adopted in 2000), which simplifies the financial-product story (no FX risk for R1, currency-formatting is straightforward, no monetary-policy variation across the country).
- Ecuador has a formal supervisory body for the cooperative and popular-economy sector — *Superintendencia de Economía Popular y Solidaria (SEPS)* — created under the 2011 *Ley Orgánica de Economía Popular y Solidaria (LOEPS)*. SEPS regulates *cooperatives* (cajas de ahorro y crédito, cooperativas de ahorro y crédito) above certain size thresholds.
- **Informal banquitos typically operate below SEPS thresholds and are not formally registered.** This is the central regulatory framing for Mi Banquito: the tool is positioned as *internal record-keeping for a closed, non-public, non-registered group*, not as a consumer-lending product. (R3 expansion may require revisiting per country.)
- WhatsApp adoption in Ecuador is ubiquitous; PWAs are functional on most Android phones in circulation.

### 1.2 Strategic Objectives of the Process

**Why the process exists.** A banquito exists when its members judge that a self-organized closed group offers them better outcomes than (a) formal banking (which they may not qualify for, may not trust, or may find too expensive), and (b) informal alternatives (a moneylender, family loans, no savings at all). The group's primary objective is *to provide members with a disciplined savings vehicle + access to short-term credit at a rate they negotiated themselves*. The treasurer's process exists to make that work without losing money or losing trust.

**How success is measured today (the treasurer's mental model).**

| Dimension | Today's measure (informal) | Implicit target |
|---|---|---|
| Personal liability | "Did anyone accuse me of mishandling money this month?" | Never |
| Time | "How many hours did I spend on books this month?" | "Not too many" |
| Errors | "Did I have to redo a calculation in front of someone?" | Zero visible errors |
| Member confidence | "Do members ask me for their balance, or do they just trust the number I give?" | Members trust the number |
| Bank vs. books | (rarely measured) | Implicit: numbers "should" agree |

**How success *should* be measured.**

| Dimension | Proposed measure |
|---|---|
| Monthly-close cycle time | Minutes (target < 30 min) |
| Reconciliation accuracy | % of months with zero ledger-vs-bank discrepancy (target 100%) |
| Statement-dispute rate | Disputes per 100 statements sent (target 0) |
| Treasurer self-report | "I would not go back to paper" (yes/no, target = yes) |
| Substrate onboarding | Time to add a second organization (target < 1 day, config-only) |

**Alignment with FcoStudios' strategy.** Mi Banquito is simultaneously (a) a real product for a real first user, (b) the validation case for the Nous pipeline as a delivery substrate for non-substrate, non-portal greenfield products, and (c) the seed of a possible LATAM micro-finance SaaS line. Each of these three lenses is genuine and they do not conflict; the product is small enough that all three can be optimized simultaneously.

---

## [2] AS-IS Process Description

### 2.1 High-Level Value Stream

The treasurer's end-to-end process in a typical Ecuadorian banquito (~20 members, monthly contribution cadence, quarterly loan cycle):

1. **Onboard a member** when admitted by the group (paper form or memory).
2. **Collect a contribution** from each member each cycle (weekly or monthly).
3. **Record the contribution** in the paper notebook and/or Excel.
4. **Receive a loan request** from a member (verbal at meeting, or via WhatsApp).
5. **Disburse the loan** (cash from the group's pool, or bank transfer from the group's account).
6. **Track the loan schedule** (payment dates, outstanding principal, interest).
7. **Record repayments** as they come in.
8. **Chase late payments** (WhatsApp, in person at meeting).
9. **Reconcile the books to the bank account** (rarely formalized; sometimes done at year-end only).
10. **Produce reports** — monthly summary for the group, year-end share-out calculation.
11. **Handle events / pooled expenses** — many groups also pool money for a year-end party, a member's funeral expense, a community project.

### 2.2 Detailed Step-by-Step Flow

The full activity inventory the system needs to support:

| # | Activity | Role(s) | Inputs | Outputs | System(s) used today | Business rules |
|---|---|---|---|---|---|---|
| A1 | Admit a new member | Treasurer + group vote | Member personal info | Notebook entry | Paper, sometimes WhatsApp ID card photo | Group bylaws; admission unanimity in some groups |
| A2 | Freeze / remove a member | Treasurer + group decision | Reason, balance settlement | Notebook entry, return of balance | Paper, bank transfer | Group bylaws; refund of accumulated savings |
| A3 | Receive a contribution | Treasurer | Member name, amount, date, slip photo | Notebook + Excel entry | Notebook, Excel, WhatsApp (slip photo) | Cycle amount, optional grace |
| A4 | Compute contribution compliance | Treasurer | Cycle ledger | "Who is up to date" list | Excel, mental math | Definition of "current"; grace cycles |
| A5 | Receive a loan request | Treasurer | Amount, term, purpose | Request log entry (often informal) | WhatsApp message, verbal at meeting | Cap on loan-to-savings ratio per member; group approval rule |
| A6 | Approve and disburse a loan | Treasurer + group | Amount, term, schedule, rate | Loan record, disbursement to member | Bank app, cash, paper | Approval threshold; rate set by group |
| A7 | Compute interest accrual on a loan | Treasurer | Loan record, today's date | Interest amount owed | Excel formula, mental math | Rate (often flat per period); compounding rules |
| A8 | Receive a loan repayment | Treasurer | Member name, amount, date | Repayment entry; updated outstanding | Notebook, Excel, WhatsApp | FIFO interest-first vs. principal-first |
| A9 | Track outstanding A/R | Treasurer | Loan records, repayments | A/R aging | Excel | Definition of "late" |
| A10 | Chase late payments | Treasurer | A/R aging | Promise log | WhatsApp, in-person | Politeness norm; meeting-level escalation |
| A11 | Record a group expense (event, refund) | Treasurer | Amount, reason | A/P entry | Notebook | Approval threshold |
| A12 | Reconcile books to bank | Treasurer | Bank statement, books | Discrepancy amount | Bank app, Excel | Frequency (rarely defined) |
| A13 | Compute monthly close | Treasurer | All entries this cycle | Monthly summary | Excel | Group reporting cadence |
| A14 | Compute year-end share-out | Treasurer + president | Year ledger | Per-member share | Excel | Share-out formula (proportional to savings, fixed per member, or hybrid) |
| A15 | Produce per-member statement | Treasurer | Member ledger | Statement (often verbal or paper) | Mental math, paper | On-request |
| A16 | Communicate with members | Treasurer | Statement, reminder | WhatsApp message | WhatsApp | Tone; privacy of amounts |

### 2.3 Actors, Roles, and Responsibilities

| Role | Typical profile | Responsibilities | Interaction pattern |
|---|---|---|---|
| **Treasurer** | One person, elected/volunteered, often non-finance background, mid-life adult, primary device = phone, primary digital channel = WhatsApp | All of A1–A16; bears personal accountability for the money | Daily contact with members; weekly to monthly book updates; in-person meeting cycle |
| **President** | One person, often the same as the founder of the group | Convenes meetings, mediates disputes, sometimes co-signs the bank account | Monthly review of the treasurer's books |
| **Secretary** | Sometimes present, sometimes merged with treasurer | Meeting minutes, communication | Meeting-bound |
| **Member** | 10–50 people, mostly women in many LATAM groups, similar tech profile to treasurer | Contribute, request loans, repay, attend meetings | WhatsApp + monthly meeting |
| **Auditor / observer** | Rarely present in informal groups; common in formalized cajas | Read books, report to members | Annual |
| **Bank** | Local commercial bank | Hold the group's pool, process transfers | Treasurer-mediated |

**Important demographic note.** In many LATAM banquitos the membership is majority-female, and the treasurer role is more often than not held by a woman. This is consistent with global ROSCA research and shapes design choices around accessibility, language, and trust signals.

### 2.4 Systems, Data, and Integrations

**Systems used today.**

| System | What it stores / does | Typical pain |
|---|---|---|
| Paper notebook | Primary chronological ledger | Lossy, slow to query, not shareable, weather-sensitive |
| Excel (mobile or PC) | Per-member balances, often a second ledger | Not synchronized with paper; formula errors; lost files |
| WhatsApp | Communication; deposit-slip photos; ad-hoc record | Photos lost in chat scroll; no structured retrieval |
| Bank app | Disbursements, the group's pool balance | Not linked to the books; manual reconciliation |
| (none) for reporting | Reports composed verbally at the meeting | No archive; disputable from memory |

**Key data objects (implicit data model).**

- *Member* (name, contact, status, joined-on, accumulated savings)
- *Contribution* (member, cycle, amount, date, slip evidence)
- *Loan* (member, principal, term, rate, schedule, status)
- *Repayment* (loan, amount, date, interest-vs-principal split)
- *A/P entry* (purpose, amount, beneficiary, date)
- *Bank balance* (declared at each reconciliation cycle)
- *Group rules* (cycle amount, interest rate, grace, share-out formula) — usually unwritten

**Manual transfers.** Every linkage between the systems above is a manual copy-paste or a manual recompute. There are no integrations. WhatsApp photos are not parsed; bank app data is read by eye and re-keyed into Excel.

---

## [3] Pain Points, Risks, and Constraints

### 3.1 Identified Pain Points

**People.**

- **Single-point cognitive load.** One person, the treasurer, holds the entire ledger in their head and on paper. If they are sick, traveling, or unavailable, the group stalls.
- **Skill heterogeneity vs. requirements.** Treasurers are rarely chosen for finance skill; they are chosen for trust + availability. The math demand often exceeds the skill level.
- **Reputational fragility.** A single accusation of mishandling money — even if false — can end the treasurer's social standing in the group. The treasurer carries this anxiety daily.
- **Handoff is unsafe.** When a treasurer steps down, the next treasurer often inherits an opaque set of paper and Excel files and has to spend weeks reconstructing state.

**Process.**

- **Monthly close is slow.** Several hours of paper-and-Excel work; sometimes a full Sunday.
- **Reconciliation is skipped.** Many groups never formally reconcile to the bank balance until a problem surfaces. By then it is hard to find the cause.
- **A/R aging is informal.** "Who owes what" lives in the treasurer's memory; chase decisions are mood-dependent.
- **Loan-rate logic varies per loan and is recomputed by hand.** Errors compound over the loan term.
- **Year-end share-out is the highest-stakes calculation of the year** and the most likely to be disputed.

**Technology.**

- **No purpose-built tool exists at this tier.** Commercial cooperative software starts at the SEPS-registered formal cooperative tier and assumes infrastructure (compliance officer, IT staff, training budget) that informal groups do not have.
- **Excel is too capable and too fragile at once.** A misplaced formula or a deleted row destroys months of work.
- **WhatsApp is the de facto OS** and yet none of its content is structured for retrieval.

**Data.**

- **No audit trail.** Corrections in Excel or paper are destructive; there is no "previous version of this balance" anywhere.
- **No statement archive.** Statements are verbal or paper; if a member challenges a number, there is no historical record to consult.
- **No backup.** A lost phone or a lost notebook = lost data.

**Governance / Compliance.**

- **Dispute resolution is social, not procedural.** Whichever side has more group standing tends to win, not whichever side has the evidence.
- **No external audit.** Formal cooperatives are audited; informal banquitos are not. Trust depends entirely on the treasurer's reputation.
- **Regulatory gray zone.** Some LATAM jurisdictions tolerate informal groups indefinitely; others have moved to formalize them. The product needs to stay clearly on the *internal record-keeping* side of any regulatory line.

### 3.2 Root-Cause Analysis (top three pain points)

1. **Monthly-close slowness → root cause: redundant manual re-aggregation.** The treasurer maintains parallel paper + Excel records, and at month-end re-aggregates from both. The first system that produces *one canonical ledger* with derived views (per-member, per-cycle, per-loan) makes month-end close trivial.
2. **Reconciliation skipped → root cause: no workflow, no prompt.** Groups never set up a habit because there is no "system" prompting it. A workflow that requires the treasurer to enter the declared bank balance at every close, and surfaces the discrepancy immediately, builds the habit.
3. **Dispute risk → root cause: no append-only record + no per-member statement.** If every transaction is immutable and every member receives a periodic statement they can keep, disputes have to argue against documented evidence rather than against the treasurer's word.

### 3.3 Business Risks

| Risk | Type | Note |
|---|---|---|
| Adoption fails: tool too complex for non-technical treasurer | Operational | **Top risk per stakeholder.** Mitigation in [9]. |
| Member dispute against a recorded balance | Operational + reputational | Append-only ledger + statement archive |
| Data loss (lost phone, no backup, no export) | Operational | Server-side data ownership; export workflow |
| Currency mis-handling on R3 expansion | Operational + financial | No hardcoded currency; per-org config |
| Regulatory reclassification (some jurisdiction treats this as consumer lending) | Compliance | Closed-group framing; per-country guidance on R2+ |
| Substrate (Nous) gap blocks delivery | Delivery | Surface gaps as IMPs (precedent: IMP-206 filed during this very setup) |
| Scope creep from close design-partner relationship | Delivery | Written R1 scope; CHG pipeline |

### 3.4 Constraints

| Constraint | Detail |
|---|---|
| Budget | Bootstrapped; founder's time; target < $30/month hosting cost |
| Team | Solo (Francisco) + Nous pipeline as substrate |
| Timeline | 4–6 month pilot; midpoint launch 2026-10-28 |
| Device target | Low-end Android phone over intermittent 3G |
| Language | Spanish (es-EC) first; no English-only screen in R1 |
| Currency | USD only R1 but never hardcoded |
| Regulatory | Stay below "regulated financial institution" threshold |
| Hosting | Low-cost cloud; migration-friendly architecture |

---

## [4] External Benchmarks and Best Practices

### 4.1 Reference Models

**Academic / institutional frameworks for closed-group savings.**

- ROSCA / ASCA literature: Besley, Coate, and Loury's seminal paper on the economics of ROSCAs; Anderson and Baland's work on group dynamics; Aryeetey's empirical studies of informal finance in Sub-Saharan Africa. These establish *why* the closed-group pattern emerges and persists.
- Microfinance institutional literature (Grameen Bank–style joint-liability lending) is *related but different*. Grameen-style products are top-down (an MFI lends to a group); banquitos are bottom-up (members lend among themselves). The user-experience implications are different — Mi Banquito does not import the MFI client/officer model.
- The CGAP (Consultative Group to Assist the Poor) reports on community-based finance describe operational patterns and risk categories that map well onto Ecuadorian banquitos.
- BIS / FELABAN / BID reports on financial inclusion in LATAM provide quantitative context for the size of the informal financial sector (typically estimated 20–50% of LATAM adults participate in some form of informal savings group at some point).

> *Note: these are reference frameworks. Specific citations should be confirmed during the proofread / legal step (12 / 14) if any are to be quoted in product copy.*

**Process frameworks adapted from formal cooperative banking.**

- **Double-entry bookkeeping principles** apply even though the user does not know the term. Every transaction should affect two accounts (e.g., "deposit increases member balance + increases pool balance"). The product can hide the term while preserving the invariant.
- **Append-only ledger / audit log pattern.** Standard in fintech; rare in informal groups. Adopting it is the single most trust-positive design choice.
- **Period-close lock pattern.** Once a period is closed, prior-period entries are immutable; new entries reference an "adjustment" period. Standard in accounting software.
- **Reconciliation pattern.** Bank-statement vs. internal-ledger reconciliation. Standard practice; here used at the level the treasurer can perform without specialized training.

### 4.2 Peer and Industry Comparisons

**How similar groups operate today (informal).**

- *Paper + Excel + WhatsApp* is dominant in Ecuador, Mexico, Colombia, Peru. The pattern is remarkably consistent across the region.
- *Excel-only* groups exist where a tech-comfortable treasurer is present. The improvement over paper is modest because the same skill-gap remains.
- *Notion / Google Sheets shared workbooks* appear in younger urban groups but rarely in rural or older groups.

**How formal cooperatives operate (LATAM).**

- SEPS-registered cooperatives in Ecuador use specialized cooperative-banking software (Cobiscorp, Software Group's BancaPlus, custom solutions). Pricing tier: $1k–$10k/month + significant per-seat licensing.
- Microfinance institutions use Mifos X (open source), OpenCBS (open source), Musoni Microfinance (cloud), Loan Performer (proprietary), Octopus (proprietary). All target institutional users (loan officers, branch managers); none target the single-treasurer closed-group case.
- **No commercial product targets the closed-group informal tier where Mi Banquito lives.** This is the whitespace. The closest adjacencies are:
  - *Splitwise* (group expense splitting; not a ledger, no balances, no loans).
  - *Tanda / cundina apps* (a small handful in Mexico; mostly oriented to pure-ROSCA pot rotation; no accumulating-fund support; no per-member balance ledger).
  - *Mobile-money apps* (M-Pesa, MercadoPago, Yape, Plin); these are payment rails, not bookkeeping.

### 4.3 Comparative Table — AS-IS vs. Best Practice

| Dimension | AS-IS (paper + Excel + WhatsApp) | Best practice (formal coop) | Mi Banquito target |
|---|---|---|---|
| Ledger primacy | Paper + Excel coexist | Single canonical electronic ledger | Single canonical electronic ledger |
| Mutability | Destructive edits | Append-only with audit | Append-only with audit |
| Reconciliation cadence | Rare / year-end | Daily / weekly | Monthly (per close) |
| Per-member statement | On-request, verbal | Quarterly, written | Monthly, PDF over WhatsApp |
| Interest accrual | Manual per loan | Automated daily | Automated daily |
| A/R aging | Memory | System-generated | System-generated |
| Audit trail | None | Per-transaction immutable | Per-transaction immutable |
| Backup | None | Multi-region | Server-side + export |
| Compliance reporting | None | Regulatory required | Not in R1 (closed group) |
| Channel | WhatsApp ad-hoc | Branch + portal | WhatsApp (members) + PWA (treasurer) |

**Sources / reference types:** academic ROSCA/ASCA literature, CGAP community-finance reports, BIS financial-inclusion reports, FELABAN LATAM banking reports, Mifos X / OpenCBS / Musoni public documentation, Splitwise / tanda-app public marketing. Specific URLs to be confirmed in the proofread step.

---

## [5] TO-BE Process and Automation Opportunities

### 5.1 Target Design Principles

1. **Phone-first, always.** Every flow must work fully on a phone. The laptop path is a nice-to-have, never a requirement.
2. **Single canonical ledger.** Paper and Excel disappear. There is one source of truth, in the app, in `nous.db` (later, in the Mi Banquito product database).
3. **Append-only.** Every transaction is immutable. Corrections are reversal entries with a documented reason. There is no "edit a row" UI.
4. **Reconciliation is a workflow, not a report.** Every month-end requires entering the declared bank balance, and the system surfaces the discrepancy as a first-class artifact.
5. **No jargon.** No "debit/credit", no "double entry", no "GL account". Use the language a non-technical Spanish-speaking treasurer already uses: *aporte, retiro, préstamo, cuota, saldo, cierre, conciliación*.
6. **Trust by transparency.** Per-member PDF statements, generated on demand, that the member receives via WhatsApp. The statement archive is the dispute-resolution artifact.
7. **Currency- and locale-agnostic data model.** USD-Ecuador only in R1, but no `'USD'` literal anywhere outside config.
8. **Multi-tenant from day 1.** Every entity carries an `organization_id` (group_id). Onboarding a second group is a config + UI tenant-switcher, not a refactor.
9. **WhatsApp is a channel, not a feature.** R1 does not integrate WhatsApp programmatically; it produces shareable artifacts (PDFs, statement copy-paste) that the treasurer forwards.
10. **The treasurer's defaults are smart.** Most operations should have 2–3 taps. The interest rate, the cycle amount, the grace policy live in the group's config; the treasurer rarely touches them.

### 5.2 TO-BE High-Level Process

The TO-BE value stream uses the same A1–A16 activities as AS-IS, but every step is computed or recorded by the system:

1. **Onboard a member** — treasurer enters name + contact; member record created.
2. **Open a contribution cycle** — system creates the cycle for the period based on the group's config (e.g. "May 2026, USD 50 each").
3. **Record a contribution** — treasurer selects member + amount + (optional) slip photo; system writes a deposit entry; member balance updates atomically.
4. **System computes compliance** — for each member, "current / behind / advance" is derived from the cycle and contributions.
5. **Receive a loan request** — treasurer creates a loan record (amount, term, rate, member, schedule generation rule).
6. **System generates the loan schedule** — fixed-payment / interest-only / balloon as per the group's loan-type config.
7. **Disburse a loan** — treasurer marks "disbursed" with reference to bank transaction; system writes an A/P-fulfilment entry and reduces the group's pool balance.
8. **System accrues interest** — daily cron, computed against outstanding principal.
9. **Record a repayment** — treasurer enters amount + date; system applies it per the group's interest-first / principal-first config and updates outstanding.
10. **A/R aging is live** — at any moment, the treasurer sees the list of late members with amount + days late.
11. **Chase a late payment** — treasurer marks "promised on X" or "received on X"; the system tracks promises and confirmations.
12. **Record a group expense** — A/P entry; reduces pool balance.
13. **Close the month** — treasurer enters declared bank balance; system computes discrepancy; if zero (or below configured tolerance), close locks the period; if not, the discrepancy is highlighted and must be resolved or annotated.
14. **Generate per-member PDF statements** — one click; per-statement immutable archive + hash.
15. **Year-end share-out** — system applies the configured share-out formula; treasurer reviews + approves.

### 5.3 Detailed Automation Opportunities

| Activity | Today | Automation in R1 | Pattern |
|---|---|---|---|
| Compliance computation (A4) | Mental math | Derived view | Read model from ledger |
| Loan schedule generation (A6) | Hand-written | System-generated | Domain service |
| Interest accrual (A7) | Excel formula | Daily cron + per-loan accrual entry | Background job |
| A/R aging (A9) | Memory | Derived view, sorted | Read model |
| Reconciliation (A12) | Skipped | First-class workflow | Period-close lock pattern |
| Monthly close (A13) | Excel pivot | Generated report | Snapshot artifact |
| Statement generation (A15) | Verbal | PDF generator | Document service |
| Statement delivery (A16) | WhatsApp manual | WhatsApp manual + PDF link | (Bot in R2) |
| OCR on slip (sub-activity of A3) | Not done | Out of R1 scope | (Document understanding in R2) |
| Year-end share-out (A14) | Excel by hand | System-applied formula + treasurer review | Domain service |

### 5.4 Quick Wins vs. Structural Changes

**Quick wins (low complexity, high impact, ship in MVP).**

- Append-only ledger with per-member balance derived view.
- PDF statement generator with archive.
- A/R aging view.
- Single-click monthly close with reconciliation discrepancy.

**Medium-term (R1 still, higher complexity).**

- Loan schedule generation across multiple loan types (fixed-payment, interest-only, balloon).
- Daily interest accrual cron + reversal-on-period-close semantics.
- Slip-photo upload + storage (R1 has the upload; OCR is R2).
- Multi-tenant scaffolding (R1 ships with one tenant active; substrate ready for more).

**Long-term / R2+ structural changes.**

- Member-side read-only PWA (R2).
- OCR on deposit slips (R2).
- WhatsApp Business API integration for automated receipts + reminders (R2).
- Multi-currency per-org expansion (R3).
- Bank-statement CSV import / open-banking integration for assisted reconciliation (R3).
- Multi-role permissions (president, secretary, audit observer) (R2).

---

## [6] Technology and Solution Options (Comparative View)

### 6.1 Solution Architecture Overview

**Target architecture (R1).**

- **Channel:** PWA (installable on Android home screen) over HTTPS. Spanish-first UI. Offline-tolerant for read paths.
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + a small component library tuned for low-confidence touch interactions (large tap targets, generous spacing, no dense tables). Aligns with the Nous-portal precedent.
- **Backend:** FastAPI + Python + SQLAlchemy. Aligns with the Nous-portal precedent + the substrate-wide convention (HR-36 reads project shape from `project_configs`, which is FastAPI-backed).
- **Database:** PostgreSQL (managed; Supabase / Neon / RDS / Cloud SQL — chosen at architecture step). Multi-tenant via `organization_id` column on every row. Append-only ledger as an `events` table; per-entity read models materialized.
- **Object store:** Cloudflare R2 (or S3-compatible alternative) for deposit-slip photos. Aligns with the substrate (Nous already uses R2 — see `NOUS_R2_*` env vars).
- **PDF generation:** server-side, deterministic; per-statement hash stored alongside the PDF for integrity.
- **Auth:** treasurer-only single-admin role per org in R1. Magic-link email auth or phone-OTP — to be chosen at architecture step. (Member-side auth, including WhatsApp magic link, is R2.)
- **Hosting:** single low-cost compute (Render / Fly / Cloud Run / a single VPS) + managed Postgres. < $30/month target.
- **Background jobs:** daily interest accrual + nightly snapshot. Platform-agnostic cron pattern (mirrors `nous-portal`'s `pipeline_runner.py` pattern from IMP-113).

### 6.2 Technology Options

| Category | Option | Use in Mi Banquito R1 |
|---|---|---|
| Workflow / BPM | Custom state machine in the domain layer | Yes — small enough; no engine needed |
| RPA / automation | Not applicable at R1 | No |
| iPaaS / integration | Not applicable at R1 (no integrations) | No |
| AI assistants / chatbots | Not applicable at R1; possible at R2 (WhatsApp bot) | No (R1) |
| Document understanding / OCR | Deferred to R2 | No (R1) |
| Analytics / BI | Server-side aggregation + lightweight charts | Yes — for the monthly close screen |
| Mobile-money / payment rails | Not in R1 (treasurer reconciles to bank manually) | No |
| WhatsApp Business API | R2 | No (R1) |

### 6.3 Comparative Analysis — Solution Patterns

| Option | Strengths | Weaknesses | Fit for Mi Banquito |
|---|---|---|---|
| **Custom build (recommended)** | Exact UX fit; no extra licensing; tight integration with Nous pipeline | Solo-developer-time-bound | ✅ Recommended for R1 |
| Fork **Mifos X** (open source institutional MFI platform) | Mature, audited, multi-currency | Way too heavy; LO + branch + officer model wrong; UI is for institutional users | ❌ |
| Fork **OpenCBS** | Open source, MFI focus | Older codebase, less active community, same fit issues as Mifos | ❌ |
| Adopt **Splitwise** or similar group-expense app | Familiar UX | No ledger, no loans, no balances | ❌ |
| Adopt an existing Mexican *tanda* app | LATAM-native | Pure-ROSCA model only; no accumulating fund | ❌ |
| Spreadsheet-only "improvement" (templated Excel) | Cheap, familiar | Doesn't solve the audit-trail, statement, reconciliation, or multi-tenant problem | ❌ |

**Recommendation.** Custom build on the Nous-portal-aligned stack (FastAPI + Next.js + Postgres + R2). The codebase scope at R1 is small enough (estimated ~25–35 screens, ~12–15 entities; see [11]) that the engineering cost of customizing Mifos X or OpenCBS would exceed the cost of a fresh build, while the UX cost of using an institutional MFI tool would be prohibitive for the actual user.

---

## [7] Implementation Roadmap

### 7.1 Phased Plan

**Phase 0 — Discovery (done / in-progress).**
*Steps 0–1 of the Nous pipeline.* Product Brief (✓ this brief). Research (✓ this document). Decisions log to follow. *Duration: ~2 weeks total. Currently at 2026-05-28.*

**Phase 1 — Foundations (Nous pipeline Steps 2–7).**
*Personas, Journeys (AS-IS + TO-BE), ER Model, Brand, Design System, Screens.* Two client-validation gates with the design partner (after Personas and after Screens). *Duration: ~6–8 weeks. Target completion: end of July 2026.*

**Phase 2 — Architecture & Plan (Nous pipeline Steps 8–11).**
*Scope (user stories), Architecture (DDD bounded contexts), Plan (sprints + roadmap), Estimates.* *Duration: ~3 weeks. Target completion: mid-September 2026.*

**Phase 3 — Build R1.**
*Sprint execution per the generated SPRINT_PLAN.md. Substrate gates: `nous_package.py drift --strict` clean on every release; story `ready-check` registry green; HR-25 timestamp-slug migrations.* *Duration: ~6–8 weeks. Target completion: end of October 2026.*

**Phase 4 — Pilot + iterate.**
*Pilot with the first design partner (the founder's mother's group). First monthly close on the system. Field iteration based on bi-weekly observation sessions.* *Duration: 1 month. Target completion: end of November 2026.*

**Phase 5 — Scale / R2 planning.**
*Member-side PWA, deposit-slip OCR, WhatsApp Business API, second-org onboarding rehearsal. Beyond the 6-month pilot window.* *Duration: open.*

### 7.2 Change Management and Adoption

- **Bi-weekly observation sessions with the design partner** starting at Step 3 (Journeys). Time-boxed; recorded with consent; observations feed back into the design as CHGs.
- **Weekly office-hour-style call with the design partner** during Phase 3 (Build).
- **"30-second test" applied to every screen** — could the treasurer accomplish this on the first try, alone, in under 30 seconds?
- **Spanish copy reviewed by a non-technical native speaker** (the design partner herself) before each release.
- **Pilot exit criteria** — three consecutive clean monthly closes + a "would not go back to paper" confirmation from the treasurer.

### 7.3 Required Capabilities and Roles

| Role | Internal/external | Engagement |
|---|---|---|
| Product owner | Internal (Francisco) | Full |
| Engineer | Internal (Francisco) | Full |
| Designer (UX) | Internal (Francisco) with design-system support from Nous Step 6 | Full |
| Design partner (treasurer) | External (mother) | Bi-weekly through Phase 1; weekly through Phase 3; daily during pilot |
| Spanish copy reviewer | External (design partner / family) | Per release |
| Hosting (managed Postgres + compute) | External (vendor) | Always-on |

---

## [8] KPIs, Metrics, and Governance

### 8.1 Key KPIs

**Product KPIs (the pilot is "successful" when these hit target).**

| KPI | Target | Measurement |
|---|---|---|
| Monthly-close time (minutes) | < 30 min | Treasurer self-report at close |
| Reconciliation accuracy | 100% zero-discrepancy months | Computed from close-workflow data |
| Statement-dispute rate | 0 disputes | Treasurer reported |
| Treasurer NPS proxy | "Would not go back to paper" = yes | Quarterly self-report |

**Substrate / SaaS KPIs.**

| KPI | Target | Measurement |
|---|---|---|
| Time-to-onboard-second-org | < 1 day | Wall-clock from "decision to onboard" to "ready to use" |
| Drift-check pass rate at release | 100% | `nous_package.py drift --strict` |
| CI test pass rate at release | 100% | Stack-native test suite |

### 8.2 Baseline vs. Target Values

| Dimension | Baseline (estimated) | R1 target | R2 stretch |
|---|---|---|---|
| Monthly-close time | 3–5 hours (paper + Excel) | < 30 min | < 10 min |
| Reconciliation cadence | Year-end or never | Monthly | Monthly + assisted by bank-statement import |
| Statement archive | None | Monthly per member, PDF + hash | Monthly + member-portal access |
| Audit trail | None | Per-transaction immutable | + multi-region backup |
| Active orgs | 0 | 1 (the design partner) | 2–5 (validated SaaS) |

### 8.3 Governance Model

- **Owner:** Francisco Lomas (product owner + engineer).
- **Steering committee:** Francisco + the design partner; informal cadence (bi-weekly during build, daily during pilot).
- **Review cadence:**
  - *Per sprint:* `nous_trace.py story verify-sprint N` + drift-check.
  - *Per release:* full Nous pipeline drift check + manual UAT with design partner.
  - *Post-launch:* monthly review of the four product KPIs above; quarterly review of substrate KPIs.
- **Continuous improvement:** CHGs filed against the project for product-content changes; IMPs filed against `nous` for substrate gaps (precedent: IMP-206 already filed during project setup).
- **Decision log:** `DECISIONS.md` (to be created in Step 0c, alongside the PRD).

---

## [9] Risks, Dependencies, and Open Questions

### 9.1 Main Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Treasurer adoption friction** (the top risk per the brief) | High | Critical | Bi-weekly in-person observation; ruthless UX simplicity; "30-second test"; large tap targets; native-Spanish copy review; minimum-step daily flows |
| Data-integrity dispute (member contests a balance) | Medium | High | Append-only ledger; per-transaction audit; per-member statement archive with hash; period-close lock |
| Solo developer bus factor | Medium | High | Code lives in a public-or-shared repo; pipeline outputs are deterministic and reproducible; CLAUDE.md + docs are kept current |
| Substrate gap blocks delivery | Medium | Medium | File IMPs as they surface (precedent set); workaround pattern (direct DB, manual recovery) documented in IMP filings |
| Currency / locale debt at expansion | Medium | Medium | No hardcoded `USD`/`es` literals; per-org config from day 1; lint or convention to catch regressions |
| Regulatory reclassification | Low (R1) / Medium (R3) | High | Closed-group framing in copy + ToS; per-country guidance before any R2 onboarding; defer interest-on-savings if a jurisdiction treats it as deposit-taking |
| Scope creep from close design-partner relationship | Medium | Medium | Written R1 scope (this brief + PRD); CHG pipeline; deferred-features parking lot |
| Slip-photo storage cost / abuse | Low | Low | Per-org storage quota; photo compression at upload |

### 9.2 Dependencies

- **Nous pipeline** — Mi Banquito's delivery substrate. Pipeline gaps block product delivery (see IMP-206 as precedent).
- **`nous.db`** — single source of truth for the project graph. Must be healthy through the build phase.
- **Managed Postgres provider** — to be selected at architecture step.
- **Object store (R2 or S3-compatible)** — for slip photos.
- **WhatsApp** — assumed always available to the treasurer + members. Not under our control; if WhatsApp policy changes, the channel risk surfaces.
- **Bank** — the group's existing bank account remains the canonical pool. No integration in R1.

### 9.3 Open Questions and Assumptions

**Assumptions made in absence of confirmed data:**

- The design partner group uses a monthly contribution cycle (vs. weekly). Confirm in Step 2 / 3.
- The group's loan rate is a flat per-period rate (not compound). Confirm in Step 2 / 3.
- The group does not currently formalize a share-out formula; rules are by precedent. Confirm in Step 2 / 3.
- The group's bank account has a single signer. Confirm in Step 9 (Architecture).
- The treasurer's primary device is Android (not iOS). Confirm in Step 2.
- Internet connectivity is daily but intermittent. Confirm during pilot.

**Open questions the organization (Francisco + design partner) should answer before Step 9 (Architecture):**

1. **Loan default policy.** What happens when a member cannot pay? Restructure, write-off, group-vote sanction? Affects A/R schema + lifecycle states.
2. **Member exit and refund policy.** When a member leaves the group, how is their accumulated balance returned? Affects member-status state machine.
3. **Interest rate ceiling.** Is there an implicit upper bound (group bylaws or social norm)? Affects rate validation rules.
4. **Statement language for member.** Always es-EC, or per-member language preference? (R1: assume es-EC only.)
5. **Data export and ownership.** If the group decides to leave the product, what format do they get their data in? (Recommendation: full CSV export + PDF archive of statements.)
6. **Audit-log retention.** How far back must the audit log be queryable? (Recommendation: indefinite; storage cost is negligible.)
7. **Share-out formula(s).** Pro-rata to savings? Equal per member? Hybrid? Affects year-end domain service.
8. **Multi-currency activation criteria.** Under what conditions does R3 ship multi-currency? Affects roadmap commit.
9. **Member-side R2 trigger.** What signal indicates "time to ship the member portal"? (Recommendation: 3+ groups onboarded.)

---

## [10] References and Sources

**Reference types (concrete URLs to be confirmed in the proofread step 12).**

- **Academic ROSCA / ASCA literature** — Besley, Coate & Loury (1993) "The economics of rotating savings and credit associations"; Anderson & Baland (2002) "The economics of ROSCAs and intra-household resource allocation"; Aryeetey (various) on West African informal finance.
- **CGAP** (Consultative Group to Assist the Poor) — reports on community-based finance, savings groups, and digital financial inclusion.
- **FELABAN** (Federación Latinoamericana de Bancos) — LATAM banking and informal finance reports.
- **BID / IDB** (Banco Interamericano de Desarrollo) — financial inclusion in LATAM; informal-sector studies.
- **BIS** (Bank for International Settlements) — financial inclusion working papers.
- **SEPS Ecuador** (Superintendencia de Economía Popular y Solidaria) — regulatory framework for cooperatives in Ecuador under LOEPS (2011). To be re-confirmed for current thresholds before any R2 onboarding outside the design-partner group.
- **Mifos X**, **OpenCBS**, **Musoni Microfinance** — open-source and commercial cooperative / microfinance platforms; public documentation for comparative analysis.
- **CGAP / GSMA** mobile-money reports — M-Pesa, MercadoPago, Yape, Plin parallels.
- **WhatsApp Business API documentation** — for R2 integration planning.
- **Splitwise** and **tanda apps** (Mexico) — adjacent group-finance UX reference points.

> *The proofread step (12) will validate the specific URLs and confirm currency of citations.*

---

## [11] Project Sizing Profile

### 11.0 Organization Scale Assessment

| Dimension | Value | Source |
|---|---|---|
| Employee count | 1 (FcoStudios solo) | Stated |
| Annual revenue | n/a (bootstrapped indie studio; no revenue yet) | Stated |
| Geographic spread | Single-operator; first user in Ecuador | Stated |
| IT maturity | Startup / digital-native (operator = engineer) | Stated |
| Business units interacting | n/a (single owner) | Stated |

**Note.** The "organization" being scaled-assessed here is the *product team / vendor* (FcoStudios), not the *end-user organization* (the banquito group). The end-user organization is a 10–50-member informal group; that is sized in [11.1].

### 11.1 Scope Magnitude Assessment

| Dimension | Estimated count | Notes |
|---|---|---|
| Distinct business processes | 9 | Member admin, contributions, loans, repayments, A/R, A/P, reconciliation, monthly close, year-end share-out. Plus events (R1) and reporting. |
| External system integrations | 0 (R1) | Bank reconciliation is manual; WhatsApp is not integrated; OCR deferred. R2 adds ~2 (WhatsApp Business API, OCR provider). |
| Distinct user roles / personas | 3 (R1) | Treasurer (active), president (read-only / future), member (passive — receives PDFs over WhatsApp). |
| Estimated screens / views | 25–35 (R1) | Login + dashboard + member CRUD + contribution flow + loan CRUD + repayment flow + A/R + A/P + reconciliation + close + share-out + member-statement preview + settings + group-config + audit-log + report views. |
| Estimated data entities | 12–15 (R1) | Organization (group), Member, ContributionCycle, Contribution, Loan, LoanSchedule, Repayment, InterestAccrual, Expense (A/P), ReconciliationCycle, PeriodClose, StatementArchive, AuditLogEntry, SlipPhoto, GroupConfig. |
| Compliance requirements | 0 formal (R1) | Closed-group internal record-keeping. Soft target: append-only, hash-archived statements as best-practice baseline. |

### 11.2 Complexity Tier Classification

**Scope signals → S (Small).** 9 processes, 0 integrations, 25–35 screens, 12–15 entities, 0 formal compliance.

**Organization signals → XS (Micro).** Solo vendor; single first user; startup IT maturity.

**Classification rule:** "use the HIGHER tier" — but the rule also notes "a large scope at a small company may stay at its scope tier since smaller companies have less organizational overhead." Here scope is S, org is XS. Org overhead is minimal (no approval matrix, no procurement, no compliance officer). **Final tier: S (Small).**

**Reasoning.**

- Scope is genuinely *S* on every dimension. It is not a 1-process / 1-screen Micro product.
- Organization is genuinely *XS*: solo developer, no internal stakeholders to coordinate, no procurement, no compliance.
- The "higher tier" rule's intent is to flag hidden enterprise complexity. There is none here.
- The single largest source of complexity is *trust* (an attribute of the end user's group), not *organization size* (of the vendor). Trust is captured in design principles + KPIs, not in tier inflation.

### 11.3 Comparable Project Benchmarks

- **Public ROSCA / tanda apps in LATAM** (e.g., Mexican tanda startups). Public reports suggest team sizes of 2–5 engineers + a designer; build durations 4–8 months to a pilot. *Source: vendor websites + tech-press coverage; specific URLs deferred to proofread.*
- **Microfinance institution back-office build** (Mifos-based or custom for a small MFI). Team sizes 3–6, durations 6–12 months. Larger surface than Mi Banquito because of officer/branch model. *Source: Mifos community reports.*
- **Single-team SaaS MVP in LATAM B2B fintech.** Solo or pair team; 4–6 month MVP; $5k–$30k operating budget through MVP. Aligns with FcoStudios' shape.

**Recommended team-size range for Mi Banquito R1:** 1–2 FTEs (solo Francisco; optional design / copy review).
**Recommended duration range for R1:** 5–6 months (matches the brief's 4–6 month pilot window).
**Comparable budget range (operating cost, not opportunity cost):** USD 1,000–10,000 for R1 (hosting + tooling + occasional contractor for design or copy). Founder time is the dominant cost; not estimated here.

### 11.4 Sizing Signals for Estimation

```
---SIZING_PROFILE---
complexity_tier: S
org_employee_range: "1-1"
org_revenue_range: "not available"
org_geo_spread: "single-location"
org_it_maturity: "startup"
process_count: 9
integration_count: 0
persona_count: 3
screen_or_component_count: 30
entity_or_resource_count: 14
compliance_count: 0
estimated_team_size_range: "1-2 FTEs"
estimated_duration_range: "5-6 months"
comparable_budget_range: "1000-10000 USD"
risk_factors: ["solo_developer_bus_factor", "non_technical_end_user", "no_precedent_at_this_tier", "currency_locale_expansion_debt", "regulatory_reclassification_on_R3", "scope_creep_via_close_design_partner", "substrate_gap_blocks_delivery"]
---/SIZING_PROFILE---
```

---

## Notes for the Pipeline

- **Open research deepenings flagged for proofread (Step 12):** confirm exact SEPS thresholds for cooperative formalization in Ecuador as of 2026; confirm current state of LATAM tanda-app market; confirm specific URLs for ROSCA academic literature citations.
- **Open questions** [9.3] feed the Decisions log (Step 0c) and may surface as ADRs in Architecture (Step 9).
- **Sizing profile** [11.4] is consumed by the estimator agent (Step 11) and the planificator agent (Step 10).
- **Personas** (Step 2) inherits the actor inventory from [2.3] above.
- **Journeys** (Step 3) inherits the AS-IS process from [2.1] / [2.2] and the TO-BE process from [5.2].
- **ER Model** (Step 4) inherits the entity list from [11.1] (Organization, Member, ContributionCycle, Contribution, Loan, LoanSchedule, Repayment, InterestAccrual, Expense, ReconciliationCycle, PeriodClose, StatementArchive, AuditLogEntry, SlipPhoto, GroupConfig).

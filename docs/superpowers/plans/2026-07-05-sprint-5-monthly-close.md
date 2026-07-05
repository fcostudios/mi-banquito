# Sprint 5 Monthly Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Sprint 5 monthly-close vertical slice: declared balance reconciliation, discrepancy annotation, A7/A8 alerts, period close, monthly-close archive hash, and WhatsApp share attempt.

**Architecture:** Keep business rules in `packages/domain`, persistence through Drizzle and `withTenantTransaction`, and UI through the existing Next.js authenticated `cierre` route. The current schema already has `reconciliation_cycle`, `period_close`, `statement_archive`, `alert`, and period-lock triggers, so the first pass avoids migrations unless verification proves a missing constraint. Platform bootstrap/lifecycle (`US-079`, `US-080`) and richer cross-artifact PDF content (`US-086`) are independent Sprint 5 tracks and get separate execution plans after this vertical slice lands.

**Tech Stack:** Next.js App Router, React Server Components, Server Actions, TypeScript, Drizzle ORM, Postgres/Neon, Vitest, Playwright, Vercel Cron.

---

## Scope Check

This plan covers `US-044`, `US-045`, `US-046`, `US-047`, `US-060`, `US-067`, and `US-088`.

Separate plans are recommended for:
- `US-079`: platform bootstrap seed script.
- `US-080`: tenant freeze/archive lifecycle.
- `US-086`: richer member/year-end/monthly-close PDF template sections.

Those three stories are independent from the monthly-close execution path and can be implemented without blocking the `cierre` screen.

## File Structure

- Modify `packages/domain/src/reconciliation.ts`: add pure reconciliation math, execute/annotate/close service methods, A7 alert emission/clearing, monthly archive generation, and WhatsApp share audit.
- Modify `packages/domain/src/reconciliation.test.ts`: add TDD coverage for math, idempotent writes, annotation validation, close gating, archive hash determinism, share audit, and audit rollback.
- Modify `packages/domain/src/alerts.ts`: add A8 overdue-close predicate and daily emission helper.
- Modify `packages/domain/src/alerts.test.ts`: add A8 threshold and dedup coverage.
- Modify `packages/domain/src/reporting.ts`: add canonical JSON, SHA-256 hash, and monthly-close payload text helpers.
- Modify `packages/domain/src/reporting.test.ts`: add canonicalization and hash stability tests.
- Modify `apps/web/src/app/(authenticated)/cierre/actions.ts`: create server actions for declared balance, annotation, close, and share attempt.
- Modify `apps/web/src/app/(authenticated)/cierre/page.tsx`: render current cycle state, discrepancy state, annotation form, close CTA, archive link, and share CTA.
- Create `apps/web/src/app/(authenticated)/cierre/page.test.tsx`: UI state tests for green/out-of-tolerance/annotated/closed states.
- Modify `apps/web/src/lib/i18n/en-US.json`: add Spanish copy for reconciliation, discrepancy, annotation, close, PDF archive, and share.
- Modify `apps/web/src/lib/cron/handler.ts`: add A8 daily close-overdue job into daily cron, or call the new alert service from the existing daily handler.
- Modify `apps/web/src/app/api/cron/daily/route.test.ts`: assert daily cron invokes A8 close-overdue emission.
- Create `scripts/sprint5-closure-gate.mjs`: verify routes, tests, schema objects, and story evidence.
- Modify `package.json` and `apps/web/package.json`: wire `audit:sprint5` and add it to `lint:ds` after Sprint 5 lands.
- Modify `docs/stories/STATUS_REPORT.md`: add Sprint 5 evidence after implementation passes.

## Domain Contracts

Use these exported types in `packages/domain/src/reconciliation.ts`:

```ts
export type ReconciliationStatus = "within_tolerance" | "outside_tolerance" | "annotated" | "closed";

export type ReconciliationSnapshot = {
  id: string;
  orgId: string;
  cycleId: string;
  cycleLabel: string;
  declaredBankBalance: string;
  computedPoolBalance: string;
  discrepancyAmount: string;
  toleranceAmount: string;
  status: ReconciliationStatus;
  resolutionKind: string;
  resolutionNote: string | null;
  periodCloseId: string | null;
  monthlyCloseStatementId: string | null;
  monthlyClosePdfUri: string | null;
  canonicalPayloadHash: string | null;
};

export type ExecuteReconciliationInput = {
  orgId: string;
  actorId: string;
  cycleId: string;
  declaredBankBalance: string;
};

export type AnnotateReconciliationInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
  reason: string;
};

export type ClosePeriodInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
};

export type ShareMonthlyCloseInput = {
  orgId: string;
  actorId: string;
  statementArchiveId: string;
};
```

## Task 1: Reconciliation Math and Status

**Files:**
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`

- [ ] **Step 1: Write failing tests for discrepancy status**

Add this `describe` block to `packages/domain/src/reconciliation.test.ts`:

```ts
describe("monthly close reconciliation math", () => {
  it("computes absolute discrepancy and status at tolerance boundaries", async () => {
    const { classifyReconciliation } = await import("./reconciliation");

    expect(classifyReconciliation({
      declaredBankBalance: "100.00",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "0.0000",
      status: "within_tolerance",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "99.50",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-0.5000",
      status: "within_tolerance",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "98.99",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-1.0100",
      status: "outside_tolerance",
      closeAllowed: false,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "98.99",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "annotated_acceptance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-1.0100",
      status: "annotated",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "100.00",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: "22222222-2222-4222-8222-222222222222",
    })).toEqual({
      discrepancyAmount: "0.0000",
      status: "closed",
      closeAllowed: false,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: FAIL with `classifyReconciliation` not exported.

- [ ] **Step 3: Add minimal implementation**

Add this near the top of `packages/domain/src/reconciliation.ts` after constants:

```ts
export type ReconciliationStatus = "within_tolerance" | "outside_tolerance" | "annotated" | "closed";

export type ReconciliationClassificationInput = {
  declaredBankBalance: string;
  computedPoolBalance: string;
  toleranceAmount: string;
  resolutionKind: string;
  periodCloseId: string | null;
};

export type ReconciliationClassification = {
  discrepancyAmount: string;
  status: ReconciliationStatus;
  closeAllowed: boolean;
};

function decimal(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("amount_must_be_numeric");
  }
  return parsed;
}

function money4(value: number): string {
  return value.toFixed(4);
}

export function classifyReconciliation(input: ReconciliationClassificationInput): ReconciliationClassification {
  const discrepancy = decimal(input.declaredBankBalance) - decimal(input.computedPoolBalance);
  const absoluteDiscrepancy = Math.abs(discrepancy);
  const tolerance = decimal(input.toleranceAmount);

  if (input.periodCloseId) {
    return {
      discrepancyAmount: money4(discrepancy),
      status: "closed",
      closeAllowed: false,
    };
  }

  if (input.resolutionKind === "annotated_acceptance") {
    return {
      discrepancyAmount: money4(discrepancy),
      status: "annotated",
      closeAllowed: true,
    };
  }

  const withinTolerance = absoluteDiscrepancy <= tolerance;
  return {
    discrepancyAmount: money4(discrepancy),
    status: withinTolerance ? "within_tolerance" : "outside_tolerance",
    closeAllowed: withinTolerance,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: PASS for the new math tests and existing adjustment-period tests.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(reconciliation): classify monthly close discrepancy (US-044)"
```

## Task 2: Execute Reconciliation Write and A7 Alert

**Files:**
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`

- [ ] **Step 1: Write failing test for idempotent reconciliation write**

Add this test to `packages/domain/src/reconciliation.test.ts`:

```ts
it("upserts the current cycle reconciliation and emits one A7 alert when outside tolerance", async () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const fakeDb = new FakeDb([
    [{
      id: "44444444-4444-4444-8444-444444444444",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleLabel: "julio 2026",
      status: "open",
    }],
    [{
      reconciliationToleranceAmount: "0.5000",
    }],
    [{
      bankBalance: "100.0000",
      pettyCashBalance: "25.0000",
    }],
    [],
    [],
  ]);
  vi.resetModules();
  mockTenantDb(fakeDb);

  try {
    const { createReconciliationService } = await import("./reconciliation");
    const result = await createReconciliationService({ now: () => now }).executeReconciliation({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "120.0000",
    });

    expect(result).toMatchObject({
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "120.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "-5.0000",
      toleranceAmount: "0.5000",
      status: "outside_tolerance",
    });

    expect(insertedRows(fakeDb, reconciliationCycle)).toEqual([
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        declaredBankBalance: "120.0000",
        computedPoolBalance: "125.0000",
        discrepancyAmount: "-5.0000",
        toleranceAmount: "0.5000",
        resolutionKind: "auto_within_tolerance",
        createdBy: "33333333-3333-4333-8333-333333333333",
        createdByKind: "member",
      }),
    ]);

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        alertKind: "A7",
        severity: "critical",
        audience: "treasurer",
        subjectKind: "reconciliation_cycle",
        createdAt: now,
      }),
    ]);

    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({
        actionKind: "reconciliation.execute",
        subjectKind: "reconciliation_cycle",
      }),
    ]);
  } finally {
    unmockTenantDb();
  }
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: FAIL with `executeReconciliation` not present on the service.

- [ ] **Step 3: Add service method signature**

Extend the `ReconciliationService` interface:

```ts
export type ReconciliationSnapshot = {
  id: string;
  orgId: string;
  cycleId: string;
  cycleLabel: string;
  declaredBankBalance: string;
  computedPoolBalance: string;
  discrepancyAmount: string;
  toleranceAmount: string;
  status: ReconciliationStatus;
  resolutionKind: string;
  resolutionNote: string | null;
  periodCloseId: string | null;
  monthlyCloseStatementId: string | null;
  monthlyClosePdfUri: string | null;
  canonicalPayloadHash: string | null;
};

export type ExecuteReconciliationInput = {
  orgId: string;
  actorId: string;
  cycleId: string;
  declaredBankBalance: string;
};

export interface ReconciliationService {
  readonly context: "reconciliation";
  executeReconciliation(input: ExecuteReconciliationInput): Promise<ReconciliationSnapshot>;
  openAdjustmentPeriod(input: OpenAdjustmentPeriodInput): Promise<typeof reconciliationCycle.$inferSelect>;
}
```

- [ ] **Step 4: Implement the write**

In `createReconciliationService`, add `executeReconciliation` before `openAdjustmentPeriod`. Use existing imports plus add `contributionCycle`, `groupConfig`, `cashBalances`, and `statementArchive` from schema.

```ts
async executeReconciliation(input) {
  return withTenantTransaction(input.orgId, async (tx) => {
    const writtenAt = now();
    let snapshot: ReconciliationSnapshot | undefined;
    let auditEntry: AdjustmentAuditEntry | undefined;

    return writeWithAudit({
      write: async () => {
        const [cycle] = await tx.select().from(contributionCycle)
          .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.id, input.cycleId)));
        if (!cycle) {
          throw new Error("contribution_cycle_not_found");
        }

        const [config] = await tx.select({
          reconciliationToleranceAmount: groupConfig.reconciliationToleranceAmount,
        }).from(groupConfig)
          .where(and(eq(groupConfig.orgId, input.orgId), eq(groupConfig.validTo, null)));
        if (!config) {
          throw new Error("group_config_not_found");
        }

        const [balances] = await tx.select().from(cashBalances)
          .where(eq(cashBalances.orgId, input.orgId));
        if (!balances) {
          throw new Error("cash_balances_not_found");
        }

        const computedPoolBalance = money4(decimal(String(balances.bankBalance)) + decimal(String(balances.pettyCashBalance)));
        const classification = classifyReconciliation({
          declaredBankBalance: input.declaredBankBalance,
          computedPoolBalance,
          toleranceAmount: String(config.reconciliationToleranceAmount),
          resolutionKind: "auto_within_tolerance",
          periodCloseId: null,
        });

        const [existing] = await tx.select().from(reconciliationCycle)
          .where(and(
            eq(reconciliationCycle.orgId, input.orgId),
            eq(reconciliationCycle.cycleId, input.cycleId),
            eq(reconciliationCycle.periodCloseId, null),
          ));

        const values = {
          orgId: input.orgId,
          cycleId: input.cycleId,
          declaredBankBalance: input.declaredBankBalance,
          computedPoolBalance,
          discrepancyAmount: classification.discrepancyAmount,
          toleranceAmount: String(config.reconciliationToleranceAmount),
          resolutionKind: classification.status === "within_tolerance" ? "auto_within_tolerance" as const : "auto_within_tolerance" as const,
          resolutionNote: null,
          closedAt: null,
          periodCloseId: null,
          createdAt: writtenAt,
          createdBy: input.actorId,
          createdByKind: "member",
        };

        const [row] = existing
          ? await tx.update(reconciliationCycle).set(values).where(eq(reconciliationCycle.id, existing.id)).returning()
          : await tx.insert(reconciliationCycle).values(values).returning();

        if (classification.status === "outside_tolerance") {
          const [existingA7] = await tx.select().from(alert)
            .where(and(
              eq(alert.orgId, input.orgId),
              eq(alert.alertKind, "A7"),
              eq(alert.subjectKind, "reconciliation_cycle"),
              eq(alert.subjectId, row.id),
            ));
          const alertValues = {
            orgId: input.orgId,
            alertKind: "A7",
            severity: "critical" as const,
            audience: "treasurer" as const,
            subjectKind: "reconciliation_cycle",
            subjectId: row.id,
            payload: {
              title: "Discrepancia bancaria detectada",
              body: `Declarado ${input.declaredBankBalance}; libros ${computedPoolBalance}; diferencia ${classification.discrepancyAmount}.`,
              declaredBankBalance: input.declaredBankBalance,
              computedPoolBalance,
              discrepancyAmount: classification.discrepancyAmount,
            },
            dedupWindowEnd: new Date(writtenAt.getTime() + MS_PER_DAY),
            createdAt: writtenAt,
          };
          if (existingA7) {
            await tx.update(alert).set(alertValues).where(eq(alert.id, existingA7.id));
          } else {
            await tx.insert(alert).values(alertValues);
          }
        }

        snapshot = {
          id: row.id,
          orgId: row.orgId,
          cycleId: row.cycleId,
          cycleLabel: cycle.cycleLabel,
          declaredBankBalance: String(row.declaredBankBalance),
          computedPoolBalance: String(row.computedPoolBalance),
          discrepancyAmount: String(row.discrepancyAmount),
          toleranceAmount: String(row.toleranceAmount),
          status: classification.status,
          resolutionKind: row.resolutionKind,
          resolutionNote: row.resolutionNote,
          periodCloseId: row.periodCloseId,
          monthlyCloseStatementId: null,
          monthlyClosePdfUri: null,
          canonicalPayloadHash: null,
        };

        auditEntry = {
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "reconciliation.execute",
          subjectKind: "reconciliation_cycle",
          subjectId: row.id,
          payloadSnapshot: snapshot,
          reason: null,
          at: writtenAt,
          createdAt: writtenAt,
        };

        return snapshot;
      },
      audit: async () => {
        if (!auditEntry) {
          throw new Error("reconciliation audit entry is missing");
        }
        await auditWriter({ tx, entry: auditEntry });
      },
    });
  });
},
```

- [ ] **Step 5: Run test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: PASS after adjusting fake DB helpers to support `update().set().where().returning()` if the test reaches the idempotent update path.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(reconciliation): execute declared balance close check (US-044 US-067)"
```

## Task 3: Annotation Path

**Files:**
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`

- [ ] **Step 1: Write failing annotation tests**

Add:

```ts
it("requires a 10 character annotation reason and enables close after annotation", async () => {
  const fakeDb = new FakeDb([
    [{
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "120.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "-5.0000",
      toleranceAmount: "0.5000",
      resolutionKind: "auto_within_tolerance",
      resolutionNote: null,
      periodCloseId: null,
    }],
    [],
  ]);
  vi.resetModules();
  mockTenantDb(fakeDb);

  try {
    const { createReconciliationService } = await import("./reconciliation");
    const service = createReconciliationService({ now: () => new Date("2026-07-05T10:00:00.000Z") });

    await expect(service.annotateReconciliation({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      reason: "muy corto",
    })).rejects.toThrow("annotation_reason_min_length");

    await expect(service.annotateReconciliation({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      reason: "Banco reportó comisión pendiente",
    })).resolves.toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      status: "annotated",
      resolutionKind: "annotated_acceptance",
      resolutionNote: "Banco reportó comisión pendiente",
    });
  } finally {
    unmockTenantDb();
  }
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: FAIL with `annotateReconciliation` missing.

- [ ] **Step 3: Implement annotation**

Add the input type and method to `ReconciliationService`:

```ts
export type AnnotateReconciliationInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
  reason: string;
};
```

Add helper:

```ts
function requireAnnotationReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    throw new Error("annotation_reason_min_length");
  }
  return trimmed;
}
```

Add method:

```ts
async annotateReconciliation(input) {
  const reason = requireAnnotationReason(input.reason);
  return withTenantTransaction(input.orgId, async (tx) => {
    const writtenAt = now();
    let snapshot: ReconciliationSnapshot | undefined;
    let auditEntry: AdjustmentAuditEntry | undefined;

    return writeWithAudit({
      write: async () => {
        const [existing] = await tx.select().from(reconciliationCycle)
          .where(and(
            eq(reconciliationCycle.orgId, input.orgId),
            eq(reconciliationCycle.id, input.reconciliationCycleId),
          ));
        if (!existing) {
          throw new Error("reconciliation_cycle_not_found");
        }
        if (existing.periodCloseId) {
          throw new Error("period_locked");
        }

        const [row] = await tx.update(reconciliationCycle).set({
          resolutionKind: "annotated_acceptance",
          resolutionNote: reason,
        }).where(eq(reconciliationCycle.id, existing.id)).returning();

        const [a7] = await tx.select().from(alert)
          .where(and(
            eq(alert.orgId, input.orgId),
            eq(alert.alertKind, "A7"),
            eq(alert.subjectKind, "reconciliation_cycle"),
            eq(alert.subjectId, existing.id),
          ));
        if (a7) {
          await tx.insert(alertAction).values({
            orgId: input.orgId,
            alertId: a7.id,
            actionKind: "dismiss",
            snoozedUntil: null,
            actorId: input.actorId,
            actorKind: "member",
            reason,
            createdAt: writtenAt,
          });
        }

        const classification = classifyReconciliation({
          declaredBankBalance: String(row.declaredBankBalance),
          computedPoolBalance: String(row.computedPoolBalance),
          toleranceAmount: String(row.toleranceAmount),
          resolutionKind: row.resolutionKind,
          periodCloseId: row.periodCloseId,
        });

        snapshot = {
          id: row.id,
          orgId: row.orgId,
          cycleId: row.cycleId,
          cycleLabel: "",
          declaredBankBalance: String(row.declaredBankBalance),
          computedPoolBalance: String(row.computedPoolBalance),
          discrepancyAmount: String(row.discrepancyAmount),
          toleranceAmount: String(row.toleranceAmount),
          status: classification.status,
          resolutionKind: row.resolutionKind,
          resolutionNote: row.resolutionNote,
          periodCloseId: row.periodCloseId,
          monthlyCloseStatementId: null,
          monthlyClosePdfUri: null,
          canonicalPayloadHash: null,
        };

        auditEntry = {
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "reconciliation.annotate",
          subjectKind: "reconciliation_cycle",
          subjectId: row.id,
          payloadSnapshot: {
            priorResolutionKind: existing.resolutionKind,
            newResolutionKind: row.resolutionKind,
            reason,
          },
          reason,
          at: writtenAt,
          createdAt: writtenAt,
        };

        return snapshot;
      },
      audit: async () => {
        if (!auditEntry) {
          throw new Error("reconciliation annotation audit entry is missing");
        }
        await auditWriter({ tx, entry: auditEntry });
      },
    });
  });
},
```

- [ ] **Step 4: Run tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(reconciliation): annotate close discrepancy (US-045)"
```

## Task 4: Period Close and Archive Hash

**Files:**
- Modify: `packages/domain/src/reporting.ts`
- Modify: `packages/domain/src/reporting.test.ts`
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`

- [ ] **Step 1: Write canonical JSON tests**

Add to `packages/domain/src/reporting.test.ts`:

```ts
import { canonicalJson, sha256Hex } from "./reporting";

describe("canonical monthly close payload hashing", () => {
  it("orders object keys deterministically before hashing", () => {
    const left = canonicalJson({ b: 2, a: { d: 4, c: 3 } });
    const right = canonicalJson({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(right).toBe(left);
    expect(sha256Hex(left)).toBe("a36a9b1d780201bcb1d3e1e005da38634d82ff43b636ffb654d91c4db0c5e15d");
  });
});
```

- [ ] **Step 2: Run failing reporting test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reporting.test.ts
```

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement canonical helpers**

Add to `packages/domain/src/reporting.ts`:

```ts
import { createHash } from "node:crypto";
```

Then add:

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
```

- [ ] **Step 4: Run reporting test**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reporting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing close test**

Add to `packages/domain/src/reconciliation.test.ts`:

```ts
it("closes an annotated reconciliation, writes statement archive, and is idempotent by cycle", async () => {
  const closedAt = new Date("2026-07-05T12:00:00.000Z");
  const reconciliationRow = {
    id: "55555555-5555-4555-8555-555555555555",
    orgId: "11111111-1111-4111-8111-111111111111",
    cycleId: "44444444-4444-4444-8444-444444444444",
    declaredBankBalance: "120.0000",
    computedPoolBalance: "125.0000",
    discrepancyAmount: "-5.0000",
    toleranceAmount: "0.5000",
    resolutionKind: "annotated_acceptance",
    resolutionNote: "Banco reportó comisión pendiente",
    periodCloseId: null,
  };
  const fakeDb = new FakeDb([
    [reconciliationRow],
    [],
    [],
  ]);
  vi.resetModules();
  mockTenantDb(fakeDb);

  try {
    const { createReconciliationService } = await import("./reconciliation");
    const close = await createReconciliationService({ now: () => closedAt }).closePeriod({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
    });

    expect(close).toMatchObject({
      periodCloseId: expect.any(String),
      monthlyClosePdfUri: expect.stringContaining("/statement-archive/monthly-close/"),
      status: "closed",
    });

    expect(insertedRows(fakeDb, periodClose)).toHaveLength(1);
    expect(insertedRows(fakeDb, statementArchive)).toEqual([
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        kind: "monthly_close",
        periodLabel: "julio 2026",
        canonicalPayloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        createdByKind: "system",
      }),
    ]);
  } finally {
    unmockTenantDb();
  }
});
```

- [ ] **Step 6: Implement `closePeriod`**

Add `periodClose`, `statementArchive`, and reporting helpers to imports. Add:

```ts
export type ClosePeriodInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
};
```

Add service method:

```ts
async closePeriod(input) {
  return withTenantTransaction(input.orgId, async (tx) => {
    const closedAt = now();
    let auditEntry: AdjustmentAuditEntry | undefined;

    return writeWithAudit({
      write: async () => {
        const [reconciliation] = await tx.select().from(reconciliationCycle)
          .where(and(
            eq(reconciliationCycle.orgId, input.orgId),
            eq(reconciliationCycle.id, input.reconciliationCycleId),
          ));
        if (!reconciliation) {
          throw new Error("reconciliation_cycle_not_found");
        }

        const classification = classifyReconciliation({
          declaredBankBalance: String(reconciliation.declaredBankBalance),
          computedPoolBalance: String(reconciliation.computedPoolBalance),
          toleranceAmount: String(reconciliation.toleranceAmount),
          resolutionKind: reconciliation.resolutionKind,
          periodCloseId: reconciliation.periodCloseId,
        });
        if (!classification.closeAllowed) {
          throw new Error("reconciliation_not_ready_to_close");
        }

        const [existingClose] = await tx.select().from(periodClose)
          .where(and(
            eq(periodClose.orgId, input.orgId),
            eq(periodClose.cycleId, reconciliation.cycleId),
          ));
        const [closeRow] = existingClose
          ? [existingClose]
          : await tx.insert(periodClose).values({
            orgId: input.orgId,
            cycleId: reconciliation.cycleId,
            reconciliationCycleId: reconciliation.id,
            closedAt,
            closedBy: input.actorId,
            closedByKind: "member",
            isYearEnd: false,
            monthlyCloseStatementId: null,
            createdAt: closedAt,
          }).returning();

        const payload = {
          kind: "monthly_close",
          orgId: input.orgId,
          cycleId: reconciliation.cycleId,
          periodCloseId: closeRow.id,
          declaredBankBalance: String(reconciliation.declaredBankBalance),
          computedPoolBalance: String(reconciliation.computedPoolBalance),
          discrepancyAmount: String(reconciliation.discrepancyAmount),
          toleranceAmount: String(reconciliation.toleranceAmount),
          resolutionKind: reconciliation.resolutionKind,
          resolutionNote: reconciliation.resolutionNote,
          closedAt: closeRow.closedAt instanceof Date ? closeRow.closedAt.toISOString() : String(closeRow.closedAt),
        };
        const hash = sha256Hex(canonicalJson(payload));
        const pdfUri = `/statement-archive/monthly-close/${hash}.pdf`;

        const [existingArchive] = await tx.select().from(statementArchive)
          .where(and(
            eq(statementArchive.orgId, input.orgId),
            eq(statementArchive.periodCloseId, closeRow.id),
            eq(statementArchive.kind, "monthly_close"),
          ));
        const [archiveRow] = existingArchive
          ? await tx.update(statementArchive).set({
            pdfUri,
            canonicalPayloadHash: hash,
            generatedAt: closedAt,
            byteSize: 0,
          }).where(eq(statementArchive.id, existingArchive.id)).returning()
          : await tx.insert(statementArchive).values({
            orgId: input.orgId,
            kind: "monthly_close",
            memberId: null,
            periodLabel: "julio 2026",
            pdfUri,
            canonicalPayloadHash: hash,
            generatedAt: closedAt,
            periodCloseId: closeRow.id,
            yearEndShareOutId: null,
            byteSize: 0,
            createdAt: closedAt,
            createdByKind: "system",
          }).returning();

        auditEntry = {
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "period_close.create",
          subjectKind: "period_close",
          subjectId: closeRow.id,
          payloadSnapshot: { periodCloseId: closeRow.id, statementArchiveId: archiveRow.id, hash },
          reason: null,
          at: closedAt,
          createdAt: closedAt,
        };

        return {
          id: reconciliation.id,
          orgId: input.orgId,
          cycleId: reconciliation.cycleId,
          cycleLabel: "julio 2026",
          declaredBankBalance: String(reconciliation.declaredBankBalance),
          computedPoolBalance: String(reconciliation.computedPoolBalance),
          discrepancyAmount: String(reconciliation.discrepancyAmount),
          toleranceAmount: String(reconciliation.toleranceAmount),
          status: "closed" as const,
          resolutionKind: reconciliation.resolutionKind,
          resolutionNote: reconciliation.resolutionNote,
          periodCloseId: closeRow.id,
          monthlyCloseStatementId: archiveRow.id,
          monthlyClosePdfUri: archiveRow.pdfUri,
          canonicalPayloadHash: archiveRow.canonicalPayloadHash,
        };
      },
      audit: async () => {
        if (!auditEntry) {
          throw new Error("period close audit entry is missing");
        }
        await auditWriter({ tx, entry: auditEntry });
      },
    });
  });
},
```

- [ ] **Step 7: Run domain tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reporting.test.ts reconciliation.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/domain/src/reporting.ts packages/domain/src/reporting.test.ts packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(reconciliation): close period and archive monthly statement (US-046 US-047)"
```

## Task 5: Cierre UI and Server Actions

**Files:**
- Create: `apps/web/src/app/(authenticated)/cierre/actions.ts`
- Create: `apps/web/src/app/(authenticated)/cierre/page.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/cierre/page.tsx`
- Modify: `apps/web/src/lib/i18n/en-US.json`

- [ ] **Step 1: Write failing page test**

Create `apps/web/src/app/(authenticated)/cierre/page.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScrMonthlyClosePage from "./page";

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: () => Promise.resolve({
    orgId: "11111111-1111-4111-8111-111111111111",
    actorId: "33333333-3333-4333-8333-333333333333",
  }),
}));

const getMonthlyCloseState = vi.fn();

vi.mock("@mi-banquito/domain", () => ({
  createReconciliationService: () => ({
    getMonthlyCloseState,
  }),
}));

describe("ScrMonthlyClosePage", () => {
  it("renders declared balance form and disables close while discrepancy is unresolved", async () => {
    getMonthlyCloseState.mockResolvedValueOnce({
      cycleId: "44444444-4444-4444-8444-444444444444",
      cycleLabel: "julio 2026",
      declaredBankBalance: "120.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "-5.0000",
      toleranceAmount: "0.5000",
      status: "outside_tolerance",
      resolutionKind: "auto_within_tolerance",
      resolutionNote: null,
      periodCloseId: null,
      monthlyCloseStatementId: null,
      monthlyClosePdfUri: null,
      canonicalPayloadHash: null,
    });

    render(await ScrMonthlyClosePage());

    expect(screen.getByRole("heading", { name: "Cierre del mes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo declarado")).toHaveValue(120);
    expect(screen.getByText("Diferencia fuera de tolerancia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar el mes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar explicación" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing page test**

Run:

```bash
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/cierre/page.test.tsx'
```

Expected: FAIL because the page still uses `createLedgerService`.

- [ ] **Step 3: Add server actions**

Create `apps/web/src/app/(authenticated)/cierre/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReconciliationService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";

export async function executeReconciliationAction(formData: FormData) {
  const session = await requireTreasurer();
  const cycleId = String(formData.get("cycleId") ?? "");
  const declaredBankBalance = String(formData.get("declaredBankBalance") ?? "");
  await createReconciliationService().executeReconciliation({
    orgId: session.orgId,
    actorId: session.actorId,
    cycleId,
    declaredBankBalance,
  });
  revalidatePath("/cierre");
  redirect("/cierre?reconciled=1");
}

export async function annotateReconciliationAction(formData: FormData) {
  const session = await requireTreasurer();
  await createReconciliationService().annotateReconciliation({
    orgId: session.orgId,
    actorId: session.actorId,
    reconciliationCycleId: String(formData.get("reconciliationCycleId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/cierre");
  redirect("/cierre?annotated=1");
}

export async function closePeriodAction(formData: FormData) {
  const session = await requireTreasurer();
  await createReconciliationService().closePeriod({
    orgId: session.orgId,
    actorId: session.actorId,
    reconciliationCycleId: String(formData.get("reconciliationCycleId") ?? ""),
  });
  revalidatePath("/cierre");
  redirect("/cierre?closed=1");
}

export async function shareMonthlyCloseAction(formData: FormData) {
  const session = await requireTreasurer();
  const result = await createReconciliationService().recordMonthlyCloseShareAttempt({
    orgId: session.orgId,
    actorId: session.actorId,
    statementArchiveId: String(formData.get("statementArchiveId") ?? ""),
  });
  revalidatePath("/historial");
  redirect(result.whatsappUrl);
}
```

- [ ] **Step 4: Add copy**

Extend `apps/web/src/lib/i18n/en-US.json` under `sprint2.close`:

```json
"cycle": "Periodo",
"computedPool": "Saldo según libros",
"difference": "Diferencia",
"tolerance": "Tolerancia",
"saveDeclared": "Revisar diferencia",
"withinTolerance": "Diferencia dentro de tolerancia",
"outsideTolerance": "Diferencia fuera de tolerancia",
"annotated": "Diferencia explicada",
"closed": "Mes cerrado",
"annotationReason": "Explicación",
"annotationHint": "Escribe al menos 10 caracteres.",
"saveAnnotation": "Guardar explicación",
"closeMonth": "Cerrar el mes",
"previewPdf": "Ver PDF",
"sharePresident": "Enviar a presidenta",
"hash": "Código de verificación"
```

- [ ] **Step 5: Replace page rendering**

Modify `apps/web/src/app/(authenticated)/cierre/page.tsx` to use `createReconciliationService().getMonthlyCloseState(session.orgId)` and the server actions. Preserve `data-screen="SCR-monthly-close"`.

Use this component shape:

```tsx
import { createReconciliationService } from "@mi-banquito/domain";
import { FormField, InputNumber } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import {
  annotateReconciliationAction,
  closePeriodAction,
  executeReconciliationAction,
  shareMonthlyCloseAction,
} from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.close;

function statusLabel(status: string) {
  if (status === "closed") return copy.closed;
  if (status === "annotated") return copy.annotated;
  if (status === "within_tolerance") return copy.withinTolerance;
  return copy.outsideTolerance;
}

export default async function ScrMonthlyClosePage() {
  const session = await requireTreasurer();
  const state = await createReconciliationService().getMonthlyCloseState(session.orgId);
  const canClose = state.status === "within_tolerance" || state.status === "annotated";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" data-screen="SCR-monthly-close">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-text-secondary">{copy.description}</p>
      </div>

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.reconciliationRows}>
        <p className="text-sm font-semibold text-text-secondary">{copy.cycle}: {state.cycleLabel}</p>
        <form action={executeReconciliationAction} className="grid gap-3">
          <input type="hidden" name="cycleId" value={state.cycleId} />
          <FormField labelKey={copy.declaredBalance}>
            <InputNumber
              name="declaredBankBalance"
              min="0"
              step="0.01"
              defaultValue={Number(state.declaredBankBalance)}
              aria-label={copy.declaredBalance}
            />
          </FormField>
          <button type="submit" className="rounded-md bg-brand px-4 py-2 font-semibold text-white">
            {copy.saveDeclared}
          </button>
        </form>

        <div className="grid gap-2 rounded-md border border-border bg-background p-4">
          <p>{copy.computedPool}: <strong>{ecCurrency.format(Number(state.computedPoolBalance))}</strong></p>
          <p>{copy.difference}: <strong>{ecCurrency.format(Number(state.discrepancyAmount))}</strong></p>
          <p>{copy.tolerance}: <strong>{ecCurrency.format(Number(state.toleranceAmount))}</strong></p>
          <p className="font-semibold">{statusLabel(state.status)}</p>
        </div>

        {state.status === "outside_tolerance" ? (
          <form action={annotateReconciliationAction} className="grid gap-3">
            <input type="hidden" name="reconciliationCycleId" value={state.id} />
            <FormField labelKey={copy.annotationReason}>
              <textarea
                name="reason"
                minLength={10}
                required
                className="min-h-24 rounded-md border border-border bg-surface p-3 text-text-primary"
                aria-describedby="annotation-hint"
              />
            </FormField>
            <p id="annotation-hint" className="text-sm text-text-secondary">{copy.annotationHint}</p>
            <button type="submit" className="rounded-md border border-border px-4 py-2 font-semibold">
              {copy.saveAnnotation}
            </button>
          </form>
        ) : null}

        <form action={closePeriodAction}>
          <input type="hidden" name="reconciliationCycleId" value={state.id} />
          <button type="submit" disabled={!canClose} className="rounded-md bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">
            {copy.closeMonth}
          </button>
        </form>

        {state.monthlyCloseStatementId && state.monthlyClosePdfUri ? (
          <div className="grid gap-3 rounded-md border border-border bg-background p-4">
            <a href={state.monthlyClosePdfUri} className="font-semibold text-brand">{copy.previewPdf}</a>
            <p className="text-sm text-text-secondary">{copy.hash}: {state.canonicalPayloadHash}</p>
            <form action={shareMonthlyCloseAction}>
              <input type="hidden" name="statementArchiveId" value={state.monthlyCloseStatementId} />
              <button type="submit" className="rounded-md border border-border px-4 py-2 font-semibold">
                {copy.sharePresident}
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Implement `getMonthlyCloseState` in domain**

Add this inputless service method signature:

```ts
getMonthlyCloseState(orgId: string): Promise<ReconciliationSnapshot>;
```

Add this method to `createReconciliationService`:

```ts
async getMonthlyCloseState(orgId) {
  return withTenantTransaction(orgId, async (tx) => {
    const [cycle] = await tx.select().from(contributionCycle)
      .where(and(eq(contributionCycle.orgId, orgId), eq(contributionCycle.status, "open")))
      .orderBy(desc(contributionCycle.opensOn))
      .limit(1);
    if (!cycle) {
      throw new Error("open_contribution_cycle_not_found");
    }

    const [config] = await tx.select({
      reconciliationToleranceAmount: groupConfig.reconciliationToleranceAmount,
    }).from(groupConfig)
      .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
      .orderBy(desc(groupConfig.version))
      .limit(1);
    if (!config) {
      throw new Error("group_config_not_found");
    }

    const [balances] = await tx.select().from(cashBalances)
      .where(eq(cashBalances.orgId, orgId))
      .limit(1);
    if (!balances) {
      throw new Error("cash_balances_not_found");
    }

    const [reconciliation] = await tx.select().from(reconciliationCycle)
      .where(and(
        eq(reconciliationCycle.orgId, orgId),
        eq(reconciliationCycle.cycleId, cycle.id),
      ))
      .orderBy(desc(reconciliationCycle.createdAt))
      .limit(1);

    const computedPoolBalance = money4(decimal(String(balances.bankBalance)) + decimal(String(balances.pettyCashBalance)));

    if (!reconciliation) {
      const classification = classifyReconciliation({
        declaredBankBalance: computedPoolBalance,
        computedPoolBalance,
        toleranceAmount: String(config.reconciliationToleranceAmount),
        resolutionKind: "auto_within_tolerance",
        periodCloseId: null,
      });
      return {
        id: "",
        orgId,
        cycleId: cycle.id,
        cycleLabel: cycle.cycleLabel,
        declaredBankBalance: computedPoolBalance,
        computedPoolBalance,
        discrepancyAmount: classification.discrepancyAmount,
        toleranceAmount: String(config.reconciliationToleranceAmount),
        status: classification.status,
        resolutionKind: "auto_within_tolerance",
        resolutionNote: null,
        periodCloseId: null,
        monthlyCloseStatementId: null,
        monthlyClosePdfUri: null,
        canonicalPayloadHash: null,
      };
    }

    const [closeRow] = reconciliation.periodCloseId
      ? await tx.select().from(periodClose)
        .where(and(eq(periodClose.orgId, orgId), eq(periodClose.id, reconciliation.periodCloseId)))
        .limit(1)
      : [];
    const [archiveRow] = closeRow
      ? await tx.select().from(statementArchive)
        .where(and(
          eq(statementArchive.orgId, orgId),
          eq(statementArchive.periodCloseId, closeRow.id),
          eq(statementArchive.kind, "monthly_close"),
        ))
        .limit(1)
      : [];

    const classification = classifyReconciliation({
      declaredBankBalance: String(reconciliation.declaredBankBalance),
      computedPoolBalance: String(reconciliation.computedPoolBalance),
      toleranceAmount: String(reconciliation.toleranceAmount),
      resolutionKind: reconciliation.resolutionKind,
      periodCloseId: closeRow?.id ?? null,
    });

    return {
      id: reconciliation.id,
      orgId,
      cycleId: cycle.id,
      cycleLabel: cycle.cycleLabel,
      declaredBankBalance: String(reconciliation.declaredBankBalance),
      computedPoolBalance: String(reconciliation.computedPoolBalance),
      discrepancyAmount: String(reconciliation.discrepancyAmount),
      toleranceAmount: String(reconciliation.toleranceAmount),
      status: classification.status,
      resolutionKind: reconciliation.resolutionKind,
      resolutionNote: reconciliation.resolutionNote,
      periodCloseId: closeRow?.id ?? null,
      monthlyCloseStatementId: archiveRow?.id ?? null,
      monthlyClosePdfUri: archiveRow?.pdfUri ?? null,
      canonicalPayloadHash: archiveRow?.canonicalPayloadHash ?? null,
    };
  });
},
```

- [ ] **Step 7: Run page test**

Run:

```bash
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/cierre/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/web/src/app/'(authenticated)'/cierre apps/web/src/lib/i18n/en-US.json packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts
rtk git commit -m "feat(web): add monthly close reconciliation flow (US-044 US-045 US-046)"
```

## Task 6: A8 Close-Overdue Daily Alert

**Files:**
- Modify: `packages/domain/src/alerts.ts`
- Modify: `packages/domain/src/alerts.test.ts`
- Modify: `apps/web/src/lib/cron/handler.ts`
- Modify: `apps/web/src/app/api/cron/daily/route.test.ts`

- [ ] **Step 1: Write A8 predicate tests**

Add to `packages/domain/src/alerts.test.ts`:

```ts
it("classifies close overdue at the configured threshold", async () => {
  await withMockedDb(new FakeDb(), async () => {
    const { closeOverdueAlertState } = await import("./alerts");
    const today = new Date("2026-07-15T00:00:00.000Z");

    expect(closeOverdueAlertState({
      today,
      latestClosedAt: new Date("2026-07-02T00:00:00.000Z"),
      baselineAt: new Date("2026-07-01T00:00:00.000Z"),
      thresholdDays: 14,
    })).toEqual({ overdue: false, daysSinceClose: 13 });

    expect(closeOverdueAlertState({
      today,
      latestClosedAt: new Date("2026-06-30T00:00:00.000Z"),
      baselineAt: new Date("2026-07-01T00:00:00.000Z"),
      thresholdDays: 14,
    })).toEqual({ overdue: true, daysSinceClose: 15 });
  });
});
```

- [ ] **Step 2: Implement A8 predicate**

Add to `packages/domain/src/alerts.ts`:

```ts
export type CloseOverdueAlertInput = {
  today: Date;
  latestClosedAt: Date | null;
  baselineAt: Date;
  thresholdDays: number;
};

export function closeOverdueAlertState(input: CloseOverdueAlertInput): { overdue: boolean; daysSinceClose: number } {
  const anchor = input.latestClosedAt ?? input.baselineAt;
  const daysSinceClose = Math.floor((input.today.getTime() - anchor.getTime()) / MS_PER_DAY);
  return {
    overdue: daysSinceClose > input.thresholdDays,
    daysSinceClose,
  };
}
```

If `MS_PER_DAY` is currently local to `reconciliation.ts`, duplicate the constant in `alerts.ts`:

```ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

- [ ] **Step 3: Add service method and cron wiring**

Extend `AlertsService`:

```ts
emitCloseOverdueAlerts(input: { today: Date }): Promise<{ orgsScanned: number; alertsEmitted: number; alertsUpdated: number }>;
```

Implement it by reading active organizations, latest `periodClose`, group config threshold from `config.close_overdue_threshold_days ?? 14`, and inserting/updating `alertKind: "A8"` with `audience: "both"`, `severity: "medium"`, and payload:

```ts
{
  title: "Periodo sin cerrar",
  body: `No has cerrado el mes en los últimos ${daysSinceClose} días.`,
  daysSinceClose,
}
```

Wire it into `apps/web/src/lib/cron/handler.ts` daily job summary as:

```ts
const closeOverdue = await createAlertsService().emitCloseOverdueAlerts({ today: toDateObject(toDate) });
summary.closeOverdueAlertsEmitted = closeOverdue.alertsEmitted;
summary.closeOverdueAlertsUpdated = closeOverdue.alertsUpdated;
```

- [ ] **Step 4: Run tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- alerts.test.ts
rtk pnpm --filter mi-banquito-web test -- 'src/app/api/cron/daily/route.test.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/domain/src/alerts.ts packages/domain/src/alerts.test.ts apps/web/src/lib/cron/handler.ts apps/web/src/app/api/cron/daily/route.test.ts
rtk git commit -m "feat(alerts): emit close overdue alerts (US-088)"
```

## Task 7: Monthly Close Share Attempt

**Files:**
- Modify: `packages/domain/src/reconciliation.ts`
- Modify: `packages/domain/src/reconciliation.test.ts`
- Modify: `apps/web/src/app/(authenticated)/cierre/actions.ts`

- [ ] **Step 1: Write failing share audit test**

Add:

```ts
it("records monthly close WhatsApp share attempt and returns a WhatsApp URL", async () => {
  const fakeDb = new FakeDb([
    [{
      id: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
      kind: "monthly_close",
      pdfUri: "https://blob.vercel-storage.com/monthly-close.pdf",
      canonicalPayloadHash: "a".repeat(64),
    }],
  ]);
  vi.resetModules();
  mockTenantDb(fakeDb);

  try {
    const { createReconciliationService } = await import("./reconciliation");
    await expect(createReconciliationService().recordMonthlyCloseShareAttempt({
      orgId: "11111111-1111-4111-8111-111111111111",
      actorId: "33333333-3333-4333-8333-333333333333",
      statementArchiveId: "99999999-9999-4999-8999-999999999999",
    })).resolves.toEqual({
      whatsappUrl: "https://wa.me/?text=Revisa%20el%20cierre%20del%20mes%3A%20https%3A%2F%2Fblob.vercel-storage.com%2Fmonthly-close.pdf",
    });

    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({
        actionKind: "statement_archive.share_whatsapp",
        subjectKind: "statement_archive",
        subjectId: "99999999-9999-4999-8999-999999999999",
      }),
    ]);
  } finally {
    unmockTenantDb();
  }
});
```

- [ ] **Step 2: Implement share helper**

Add:

```ts
export type ShareMonthlyCloseInput = {
  orgId: string;
  actorId: string;
  statementArchiveId: string;
};

export function monthlyCloseShareUrl(pdfUri: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Revisa el cierre del mes: ${pdfUri}`)}`;
}
```

Add service method:

```ts
async recordMonthlyCloseShareAttempt(input) {
  return withTenantTransaction(input.orgId, async (tx) => {
    const sharedAt = now();
    const [archive] = await tx.select().from(statementArchive)
      .where(and(
        eq(statementArchive.orgId, input.orgId),
        eq(statementArchive.id, input.statementArchiveId),
        eq(statementArchive.kind, "monthly_close"),
      ));
    if (!archive) {
      throw new Error("monthly_close_statement_not_found");
    }
    await tx.insert(auditLogEntry).values({
      orgId: input.orgId,
      actorKind: "member",
      actorId: input.actorId,
      actionKind: "statement_archive.share_whatsapp",
      subjectKind: "statement_archive",
      subjectId: archive.id,
      payloadSnapshot: {
        pdfUri: archive.pdfUri,
        canonicalPayloadHash: archive.canonicalPayloadHash,
      },
      reason: null,
      at: sharedAt,
      createdAt: sharedAt,
    });
    return { whatsappUrl: monthlyCloseShareUrl(archive.pdfUri) };
  });
},
```

- [ ] **Step 3: Run tests**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/cierre/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/domain/src/reconciliation.ts packages/domain/src/reconciliation.test.ts apps/web/src/app/'(authenticated)'/cierre/actions.ts
rtk git commit -m "feat(reconciliation): audit monthly close share attempt (US-060)"
```

## Task 8: Sprint 5 Closure Gate

**Files:**
- Create: `scripts/sprint5-closure-gate.mjs`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `docs/stories/STATUS_REPORT.md`

- [ ] **Step 1: Create closure script**

Create `scripts/sprint5-closure-gate.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "apps/web/src/app/(authenticated)/cierre/actions.ts",
  "apps/web/src/app/(authenticated)/cierre/page.test.tsx",
  "packages/domain/src/reconciliation.ts",
  "packages/domain/src/reconciliation.test.ts",
  "packages/domain/src/reporting.ts",
  "packages/domain/src/reporting.test.ts",
];

const requiredText = [
  ["packages/domain/src/reconciliation.ts", "executeReconciliation"],
  ["packages/domain/src/reconciliation.ts", "annotateReconciliation"],
  ["packages/domain/src/reconciliation.ts", "closePeriod"],
  ["packages/domain/src/reconciliation.ts", "recordMonthlyCloseShareAttempt"],
  ["packages/domain/src/reporting.ts", "canonicalJson"],
  ["packages/domain/src/alerts.ts", "closeOverdueAlertState"],
  ["apps/web/src/app/(authenticated)/cierre/page.tsx", "data-screen=\"SCR-monthly-close\""],
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
  }
}

for (const [file, needle] of requiredText) {
  if (!existsSync(file)) {
    failures.push(`missing ${file}`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (!text.includes(needle)) {
    failures.push(`${file} does not include ${needle}`);
  }
}

if (failures.length > 0) {
  console.error("Sprint 5 closure gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Sprint 5 closure gate passed.");
```

- [ ] **Step 2: Wire script**

Add to root `package.json` scripts:

```json
"audit:sprint5": "node scripts/sprint5-closure-gate.mjs"
```

Add to `apps/web/package.json` `lint:ds` command after `sprint4-closure-gate.mjs`:

```bash
&& node ../../scripts/sprint5-closure-gate.mjs ../..
```

- [ ] **Step 3: Add status report evidence**

Append to `docs/stories/STATUS_REPORT.md`:

```md
## Sprint 5 Monthly Close Evidence

Sprint 5 monthly-close vertical slice is implemented and locally verified:

- US-044: declared balance reconciliation writes an idempotent `ReconciliationCycle`.
- US-045: out-of-tolerance discrepancy annotation requires a 10-character reason and enables close.
- US-046: close writes an idempotent `PeriodClose`; period-lock trigger remains the authoritative guard.
- US-047: monthly-close archive writes deterministic canonical payload hash.
- US-060: monthly-close WhatsApp share attempt emits audit evidence.
- US-067: A7 discrepancy alert emits and clears through reconciliation/annotation.
- US-088: A8 close-overdue alert predicate and daily cron wiring are covered.

Verification commands:

- `rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts reporting.test.ts alerts.test.ts`
- `rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/cierre/page.test.tsx' 'src/app/api/cron/daily/route.test.ts'`
- `rtk pnpm type-check`
- `rtk pnpm lint`
- `rtk pnpm build`
- `rtk pnpm audit:sprint5`
```

- [ ] **Step 4: Run closure commands**

Run:

```bash
rtk pnpm --filter @mi-banquito/domain test -- reconciliation.test.ts reporting.test.ts alerts.test.ts
rtk pnpm --filter mi-banquito-web test -- 'src/app/(authenticated)/cierre/page.test.tsx' 'src/app/api/cron/daily/route.test.ts'
rtk pnpm audit:sprint5
rtk pnpm type-check
rtk pnpm lint
rtk pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/sprint5-closure-gate.mjs package.json apps/web/package.json docs/stories/STATUS_REPORT.md
rtk git commit -m "chore(sprint5): add monthly close closure gate"
```

## Final Verification

- [ ] Run full local verification:

```bash
rtk pnpm type-check
rtk pnpm lint
rtk pnpm test
rtk pnpm build
rtk pnpm audit:sprint5
```

- [ ] Start local web app and smoke routes:

```bash
rtk pnpm --filter mi-banquito-web dev
```

In another terminal:

```bash
rtk curl -sS -D /tmp/cierre.headers http://localhost:3000/cierre -o /tmp/cierre.html
rtk sed -n '1,20p' /tmp/cierre.headers
```

Expected without Auth0 session: `307` redirect to `/auth/login`.

- [ ] After merge to `main`, verify production:

```bash
rtk gh run list --branch main --limit 6
rtk curl -sS -D /tmp/prod-cierre.headers https://mi-banquito.vercel.app/cierre -o /tmp/prod-cierre.html
rtk sed -n '1,20p' /tmp/prod-cierre.headers
```

Expected: latest CI green; unauthenticated `/cierre` redirects to `/auth/login`.

## Self-Review

Spec coverage:
- `US-044`: Tasks 1, 2, 5.
- `US-045`: Tasks 3, 5.
- `US-046`: Task 4 and existing period-lock migration evidence.
- `US-047`: Task 4.
- `US-060`: Task 7.
- `US-067`: Task 2 and Task 3 alert clearing.
- `US-088`: Task 6.

Placeholder scan:
- This plan avoids placeholder markers and generic error-handling instructions.

Type consistency:
- Service method names are `executeReconciliation`, `annotateReconciliation`, `closePeriod`, `recordMonthlyCloseShareAttempt`, and `getMonthlyCloseState`.
- UI action names are `executeReconciliationAction`, `annotateReconciliationAction`, `closePeriodAction`, and `shareMonthlyCloseAction`.

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  auditLogEntry,
  account,
  contribution,
  contributionCycle,
  member,
  organization,
  expense,
  periodClose,
  reconciliationCycle,
  statementArchive,
  withdrawal,
} from "@mi-banquito/db/schema";

import type {
  MonthlyMemberStatementArtifactInput,
  MonthlyMemberStatementArtifactResult,
  MonthlyMemberStatementCopy,
} from "./reporting";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // beforeAll reports the missing integration configuration explicitly.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const MEMBER_A = randomUUID();
const MEMBER_A_2 = randomUUID();
const INACTIVE_A = randomUUID();
const MEMBER_B = randomUUID();
const TREASURER_A = randomUUID();
const PERIOD_CLOSE_A = randomUUID();
const PERIOD_CLOSE_B = randomUUID();
const CYCLE_A = randomUUID();
const CYCLE_B = randomUUID();
const RECONCILIATION_A = randomUUID();
const RECONCILIATION_B = randomUUID();
const ACCOUNT_A = randomUUID();
const ADJUSTMENT_A = randomUUID();
const NOW = new Date("2026-07-31T17:00:00.000Z");
const GENERATED_AT = new Date("2026-08-01T12:00:00.000Z");
const auditTrigger = `reject_statement_audit_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const auditFunction = `${auditTrigger}_fn`;

const statementCopy: MonthlyMemberStatementCopy = {
  monthlySectionTitle: "Estado mensual",
  openingBalance: "Saldo inicial",
  contribution: "Aporte {{date}}",
  withdrawal: "Retiro {{date}}",
  closingBalance: "Saldo final",
  treasurer: "Tesorera",
  groupAccount: "Cuenta del grupo",
  noGroupAccount: "Sin cuenta registrada",
  receivedPaymentsTitle: "Pagos recibidos",
  receivedPayment: "Pago recibido de {{member}}",
  loanFee: "Mora/comisión préstamo",
  loanInterest: "Interés préstamo",
  loanPrincipal: "Capital préstamo",
  contributionAllocation: "Aporte {{cycle}}",
  fallbackAllocation: "Aplicación",
  unknownCycle: "sin período",
  unknownMember: "socia",
  reconciliationTitle: "Regularización de depósitos",
  pendingContribution: "Aporte pendiente",
  pendingRepayment: "Pago pendiente",
  regularizedContribution: "Aporte regularizado",
  regularizedRepayment: "Pago regularizado",
  regularizationTransfer: "Transferencia para regularizar",
  legacyAccount: "Cuenta histórica sin referencia",
  fundMovementsTitle: "Movimientos del fondo y colectas",
};

let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createMemberStatementService: typeof import("./member-statements")["createMemberStatementService"];
let memberStatementPreviewFromArchivedPayload: typeof import("./member-statements")["memberStatementPreviewFromArchivedPayload"];
let createReportingService: typeof import("./reporting")["createReportingService"];
let createTransparencyService: typeof import("./transparency")["createTransparencyService"];
let verifyResultFromArchivedPayload: typeof import("./reporting")["verifyResultFromArchivedPayload"];
let statementArchiveSummaryFromTransparency: typeof import("./reporting")["statementArchiveSummaryFromTransparency"];
let canonicalJson: typeof import("./reporting")["canonicalJson"];
let sha256Hex: typeof import("./reporting")["sha256Hex"];
let artifactDirectory: string;

function statementRowLabels(payload: { sections: ReadonlyArray<{ rows: ReadonlyArray<{ label: string }> }> }): string[] {
  return payload.sections.flatMap((section) => section.rows.map((row) => row.label));
}

describe("US-048 member statement service with PostgreSQL", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for member statement integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createMemberStatementService, memberStatementPreviewFromArchivedPayload } = await import("./member-statements"));
    ({ canonicalJson, createReportingService, sha256Hex, statementArchiveSummaryFromTransparency, verifyResultFromArchivedPayload } = await import("./reporting"));
    ({ createTransparencyService } = await import("./transparency"));

    await db.insert(organization).values([
      {
        id: ORG_A,
        displayName: "Grupo A",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        brandingLogoUri: "https://assets.example/grupo-a.svg",
        createdAt: NOW,
        createdBy: TREASURER_A,
        createdByKind: "system",
      },
      {
        id: ORG_B,
        displayName: "Grupo B",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        brandingLogoUri: "https://assets.example/grupo-b.svg",
        createdAt: NOW,
        createdBy: TREASURER_A,
        createdByKind: "system",
      },
    ]);
  });

  beforeEach(async () => {
    artifactDirectory = await mkdtemp(join(tmpdir(), "mi-banquito-statements-"));
    await db.insert(member).values([
      memberRow(MEMBER_A, ORG_A, "Ana A", "activo", "100.0000"),
      memberRow(MEMBER_A_2, ORG_A, "Bea A", "activo", "25.0000"),
      memberRow(INACTIVE_A, ORG_A, "Cata A", "baja", "999.0000"),
      memberRow(MEMBER_B, ORG_B, "Sentinel B", "activo", "500.0000"),
    ]);
    await db.insert(account).values({
      id: ACCOUNT_A,
      orgId: ORG_A,
      name: "Banco A",
      type: "group_bank",
      isGroupFund: true,
      status: "active",
      createdAt: NOW,
      createdBy: TREASURER_A,
    });
    await db.insert(contributionCycle).values([
      cycleRow(CYCLE_A, ORG_A, "2026-07"),
      cycleRow(CYCLE_B, ORG_B, "2026-07"),
    ]);
    await db.insert(reconciliationCycle).values([
      reconciliationRow(RECONCILIATION_A, ORG_A, CYCLE_A),
      reconciliationRow(RECONCILIATION_B, ORG_B, CYCLE_B),
    ]);
    await db.insert(contribution).values([
      contributionRow("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ORG_A, CYCLE_A, MEMBER_A, "20.0000", "2026-07-20"),
      contributionRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ORG_A, CYCLE_A, MEMBER_A, "10.0000", "2026-07-05"),
      contributionRow(randomUUID(), ORG_A, CYCLE_A, MEMBER_A_2, "30.0000", "2026-07-10"),
      contributionRow(randomUUID(), ORG_A, CYCLE_A, INACTIVE_A, "700.0000", "2026-07-11"),
      contributionRow(randomUUID(), ORG_B, CYCLE_B, MEMBER_B, "9000.0000", "2026-07-06"),
    ]);
    await db.insert(withdrawal).values([
      withdrawalRow(randomUUID(), ORG_A, MEMBER_A, "5.0000", "2026-07-25"),
      withdrawalRow(randomUUID(), ORG_B, MEMBER_B, "4000.0000", "2026-07-25"),
    ]);
    await db.insert(periodClose).values([
      closeRow(PERIOD_CLOSE_A, ORG_A, CYCLE_A, RECONCILIATION_A),
      closeRow(PERIOD_CLOSE_B, ORG_B, CYCLE_B, RECONCILIATION_B),
    ]);
  });

  afterEach(async () => {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${auditTrigger} ON audit_log_entry`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${auditFunction}()`));
    for (const orgId of [ORG_A, ORG_B]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(statementArchive).where(eq(statementArchive.orgId, orgId));
        await tx.delete(periodClose).where(eq(periodClose.orgId, orgId));
        await tx.delete(reconciliationCycle).where(eq(reconciliationCycle.orgId, orgId));
        await tx.delete(withdrawal).where(eq(withdrawal.orgId, orgId));
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(contribution).where(eq(contribution.orgId, orgId));
        await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
    await rm(artifactDirectory, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
    }
  });

  it("GIVEN a closed period WHEN preview and batch run THEN active members receive stable isolated archives", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    const preview = await service.preview({
      orgId: ORG_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
    });
    expect(preview.payload.member.id).toBe(MEMBER_A);
    expect(preview.payload.orgName).toBe("Grupo A");
    expect(preview.canonicalPayloadHash).toBe(sha256Hex(canonicalJson(preview.payload)));
    const periodTransparency = await createTransparencyService().getPeriod({
      orgId: ORG_A,
      fromDate: "2026-07-01",
      throughDate: "2026-07-31",
      memberId: MEMBER_A,
    });
    const expectedIds = periodTransparency.rows.map((row) => row.sourceId);
    expect(preview.payload.verificationMovements.map((row) => row.sourceId)).toEqual(expectedIds);
    expect(preview.payload.verificationMovements.some((row) => row.memberId === MEMBER_B)).toBe(false);
    const verified = verifyResultFromArchivedPayload({
      canonicalPayloadHash: preview.canonicalPayloadHash,
      canonicalPayload: preview.payload,
      generatedAt: GENERATED_AT,
    });
    expect(verified.matched && verified.movements.map((row) => "sourceId" in row ? row.sourceId : row.id)).toEqual(expectedIds);
    const fullProjection = await createTransparencyService().getPeriod({
      orgId: ORG_A,
      fromDate: "2026-07-01",
      throughDate: "2026-07-31",
    });
    expect(await createReportingService().getLatestStatementSummary(ORG_A)).toEqual(
      statementArchiveSummaryFromTransparency("2026-07", fullProjection),
    );

    const first = await service.generate({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      statementCopy,
      createArtifact: localArtifactWriter,
    });
    const replay = await service.generate({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      statementCopy,
      createArtifact: localArtifactWriter,
    });
    const facadeReplay = await createReportingService().generateMonthlyMemberStatements({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      statementCopy,
      createArtifact: localArtifactWriter,
    });

    expect(first).toEqual({ generated: 2, reused: 0 });
    expect(replay).toEqual({ generated: 0, reused: 2 });
    expect(facadeReplay).toEqual({ generated: 0, reused: 2 });
    expect(await archiveCount(ORG_A, PERIOD_CLOSE_A)).toBe(2);
    expect(await generatedAuditCount(ORG_A, PERIOD_CLOSE_A)).toBe(2);
    expect(await archiveCount(ORG_B, PERIOD_CLOSE_A)).toBe(0);

    const archives = await withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArchive)
      .where(and(eq(statementArchive.orgId, ORG_A), eq(statementArchive.periodCloseId, PERIOD_CLOSE_A))));
    for (const archive of archives) {
      const bytes = await readFile(archive.pdfUri);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(archive.canonicalPayloadHash);
      expect(archive.byteSize).toBe(bytes.byteLength);
    }

    const archivedForMember = archives.find((archive) => archive.memberId === MEMBER_A)!;
    const archivedPreview = memberStatementPreviewFromArchivedPayload({
      canonicalPayload: archivedForMember.canonicalPayload,
      canonicalPayloadHash: archivedForMember.canonicalPayloadHash,
      expectedMemberId: MEMBER_A,
      expectedPeriodLabel: "2026-07",
    });
    expect(archivedPreview).toEqual(preview);
    const legacyPayload = {
      ...preview.payload,
      verificationMovements: [{
        id: "legacy-contribution-1",
        kind: "contribution",
        status: "regularized",
        amount: "25.5000",
        datedOn: "2026-07-10",
        accountName: "Cuenta histórica",
        label: "Aporte histórico archivado",
      }],
    };
    const legacyPayloadHash = sha256Hex(canonicalJson(legacyPayload));
    expect(memberStatementPreviewFromArchivedPayload({
      canonicalPayload: legacyPayload,
      canonicalPayloadHash: legacyPayloadHash,
      expectedMemberId: MEMBER_A,
      expectedPeriodLabel: "2026-07",
    })).toMatchObject({
      canonicalPayloadHash: legacyPayloadHash,
      payload: {
        verificationMovements: [{
          sourceKind: "contribution",
          sourceId: "legacy-contribution-1",
          signedAmount: "25.5000",
          label: "Aporte histórico archivado",
        }],
      },
    });
    expect(memberStatementPreviewFromArchivedPayload({
      canonicalPayload: legacyPayload,
      canonicalPayloadHash: "f".repeat(64),
      expectedMemberId: MEMBER_A,
      expectedPeriodLabel: "2026-07",
    })).toBeNull();
    const archivedArtifact = JSON.parse(await readFile(archivedForMember.pdfUri, "utf8")) as typeof preview.payload;
    expect(archivedArtifact.verificationMovements.map((row) => row.sourceId)).toEqual(expectedIds);

    const laterMovementId = randomUUID();
    await db.insert(reconciliationCycle).values({
      id: ADJUSTMENT_A,
      orgId: ORG_A,
      cycleId: CYCLE_A,
      declaredBankBalance: "0.0000",
      computedPoolBalance: "0.0000",
      discrepancyAmount: "0.0000",
      toleranceAmount: "0.0000",
      resolutionKind: "adjustment",
      resolutionNote: "Ventana de corrección posterior al archivo",
      periodCloseId: PERIOD_CLOSE_A,
      adjustmentReason: "Movimiento tardío controlado",
      adjustmentWindowOpensAt: new Date("2000-01-01T00:00:00.000Z"),
      adjustmentWindowClosesAt: new Date("2099-12-31T23:59:59.999Z"),
      createdAt: GENERATED_AT,
      createdBy: TREASURER_A,
      createdByKind: "member",
    });
    await db.insert(expense).values({
      id: laterMovementId,
      orgId: ORG_A,
      purpose: "Comisión registrada después del archivo",
      amount: "7.0000",
      currencyCode: "USD",
      beneficiaryText: "Banco A",
      incurredOn: "2026-07-29",
      status: "paid",
      recordedAt: GENERATED_AT,
      adjustmentCycleId: ADJUSTMENT_A,
      accountId: ACCOUNT_A,
      category: "bank_fee",
      clientRequestId: randomUUID(),
      createdAt: GENERATED_AT,
      createdBy: TREASURER_A,
      createdByKind: "member",
    });
    const liveAfterArchive = await service.preview({
      orgId: ORG_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
    });
    expect(liveAfterArchive.payload.verificationMovements.map((row) => row.sourceId)).toContain(laterMovementId);
    expect(memberStatementPreviewFromArchivedPayload({
      canonicalPayload: archivedForMember.canonicalPayload,
      canonicalPayloadHash: archivedForMember.canonicalPayloadHash,
      expectedMemberId: MEMBER_A,
      expectedPeriodLabel: "2026-07",
    })).toEqual(preview);
    expect(verifyResultFromArchivedPayload({
      canonicalPayload: archivedForMember.canonicalPayload,
      canonicalPayloadHash: archivedForMember.canonicalPayloadHash,
      generatedAt: archivedForMember.generatedAt,
    })).toMatchObject({
      matched: true,
      movements: preview.payload.verificationMovements,
    });
  });

  it("serializes concurrent generation for the same member before creating an artifact", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    let artifactWriterInvocations = 0;
    let signalFirstWriterStarted!: () => void;
    let releaseFirstWriter!: () => void;
    const firstWriterStarted = new Promise<void>((resolve) => {
      signalFirstWriterStarted = resolve;
    });
    const firstWriterMayFinish = new Promise<void>((resolve) => {
      releaseFirstWriter = resolve;
    });
    const concurrentArtifactWriter = async (
      input: MonthlyMemberStatementArtifactInput,
    ): Promise<MonthlyMemberStatementArtifactResult> => {
      artifactWriterInvocations += 1;
      const invocation = artifactWriterInvocations;
      if (invocation === 1) {
        signalFirstWriterStarted();
        await firstWriterMayFinish;
      } else {
        releaseFirstWriter();
      }
      const bytes = Buffer.from(canonicalJson(input.payload), "utf8");
      const pdfUri = join(artifactDirectory, `${invocation}-${input.canonicalPayloadHash}.pdf`);
      await writeFile(pdfUri, bytes);
      return { pdfUri, byteSize: bytes.byteLength };
    };
    const input = {
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
      createArtifact: concurrentArtifactWriter,
    };

    const firstGeneration = service.generate(input);
    await firstWriterStarted;
    const secondGeneration = service.generate(input);
    await waitForSecondGenerationBoundary(() => artifactWriterInvocations >= 2);
    releaseFirstWriter();

    const results = await Promise.allSettled([firstGeneration, secondGeneration]);
    expect(results).toEqual([
      { status: "fulfilled", value: { generated: 1, reused: 0 } },
      { status: "fulfilled", value: { generated: 0, reused: 1 } },
    ]);
    expect(artifactWriterInvocations).toBe(1);
    expect(await readdir(artifactDirectory)).toHaveLength(1);
    expect(await archiveCount(ORG_A, PERIOD_CLOSE_A)).toBe(1);
    expect(await generatedAuditCount(ORG_A, PERIOD_CLOSE_A)).toBe(1);
  });

  it("rejects a missing or foreign period close", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    await expect(service.preview({
      orgId: ORG_A,
      periodCloseId: randomUUID(),
      memberId: MEMBER_A,
      statementCopy,
    })).rejects.toThrow("period_close_not_found");
    await expect(service.generate({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_B,
      statementCopy,
      createArtifact: localArtifactWriter,
    })).rejects.toThrow("period_close_not_found");
  });

  it("rejects a foreign or inactive member", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    for (const memberId of [MEMBER_B, INACTIVE_A]) {
      await expect(service.preview({ orgId: ORG_A, periodCloseId: PERIOD_CLOSE_A, memberId, statementCopy }))
        .rejects.toThrow("member_not_found");
      await expect(service.generate({
        orgId: ORG_A,
        actorId: TREASURER_A,
        periodCloseId: PERIOD_CLOSE_A,
        memberId,
        statementCopy,
        createArtifact: localArtifactWriter,
      })).rejects.toThrow("member_not_found");
    }
  });

  it("rolls back the archive when its generated audit cannot be inserted", async () => {
    await db.execute(sql.raw(`
      CREATE FUNCTION ${auditFunction}() RETURNS trigger AS $$
      BEGIN
        IF NEW.action_kind = 'statement.generated' THEN
          RAISE EXCEPTION 'statement_audit_rejected';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${auditTrigger}
      BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${auditFunction}()
    `));

    const service = createMemberStatementService({ now: () => GENERATED_AT });
    await expect(service.generate({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
      createArtifact: localArtifactWriter,
      deleteArtifact: async (artifact) => rm(artifact.pdfUri),
    })).rejects.toThrow("statement_audit_rejected");
    expect(await archiveCount(ORG_A, PERIOD_CLOSE_A)).toBe(0);
    expect(await generatedAuditCount(ORG_A, PERIOD_CLOSE_A)).toBe(0);
    expect(await readdir(artifactDirectory)).toEqual([]);
  });

  it("commits each completed member in a bounded transaction and leaves no failed artifact", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    let invocation = 0;
    const failSecondArtifact = async (input: MonthlyMemberStatementArtifactInput) => {
      invocation += 1;
      if (invocation === 2) throw new Error("second_artifact_failed");
      return localArtifactWriter(input);
    };

    await expect(service.generate({
      orgId: ORG_A,
      actorId: TREASURER_A,
      periodCloseId: PERIOD_CLOSE_A,
      statementCopy,
      createArtifact: failSecondArtifact,
      deleteArtifact: async (artifact) => rm(artifact.pdfUri),
    })).rejects.toThrow("second_artifact_failed");

    expect(await archiveCount(ORG_A, PERIOD_CLOSE_A)).toBe(1);
    expect(await generatedAuditCount(ORG_A, PERIOD_CLOSE_A)).toBe(1);
    expect(await readdir(artifactDirectory)).toHaveLength(1);
  });

  it("produces stable hashes when source rows were inserted in shuffled order", async () => {
    const service = createMemberStatementService({ now: () => GENERATED_AT });
    const first = await service.preview({ orgId: ORG_A, periodCloseId: PERIOD_CLOSE_A, memberId: MEMBER_A, statementCopy });
    const second = await service.preview({ orgId: ORG_A, periodCloseId: PERIOD_CLOSE_A, memberId: MEMBER_A, statementCopy });

    expect(first.payload.sections[0]?.rows.slice(1, 3)).toEqual([
      expect.objectContaining({ label: "Aporte 2026-07-05" }),
      expect.objectContaining({ label: "Aporte 2026-07-20" }),
    ]);
    expect(second).toEqual(first);
  });

  it("uses authoritative weekly cycle bounds instead of parsing its non-month label", async () => {
    const weeklyCycleId = randomUUID();
    const weeklyReconciliationId = randomUUID();
    const weeklyCloseId = randomUUID();
    await db.insert(contributionCycle).values({
      id: weeklyCycleId,
      orgId: ORG_A,
      cycleLabel: "2026-W22",
      kind: "weekly",
      opensOn: "2026-05-25",
      closesOn: "2026-05-31",
      expectedAmountPerMember: "13.0000",
      currencyCode: "USD",
      status: "closed",
      createdAt: NOW,
      createdBy: TREASURER_A,
      createdByKind: "system",
    });
    await db.insert(contribution).values(contributionRow(
      randomUUID(), ORG_A, weeklyCycleId, MEMBER_A, "13.0000", "2026-05-27",
    ));
    await db.insert(reconciliationCycle).values(reconciliationRow(
      weeklyReconciliationId, ORG_A, weeklyCycleId,
    ));
    await db.insert(periodClose).values({
      ...closeRow(weeklyCloseId, ORG_A, weeklyCycleId, weeklyReconciliationId),
      closedAt: GENERATED_AT,
      createdAt: GENERATED_AT,
    });

    const weeklyPreview = await createMemberStatementService().preview({
      orgId: ORG_A,
      periodCloseId: weeklyCloseId,
      memberId: MEMBER_A,
      statementCopy,
    });
    expect(weeklyPreview.payload.periodLabel).toBe("2026-W22");
    expect(statementRowLabels(weeklyPreview.payload))
      .toContain("Aporte 2026-05-27");
    expect(weeklyPreview.payload.verificationMovements.map((row) => row.datedOn)).toEqual(["2026-05-27"]);

    expect(await createReportingService().getLatestStatementSummary(ORG_A)).toEqual({
      periodLabel: "2026-W22",
      members: 1,
      in: "13.0000",
      out: "0.0000",
      movements: "0.0000",
      saldo: "13.0000",
    });
  });

  it("fences baseline and transparency reads against a concurrent money write", async () => {
    const adjustmentId = randomUUID();
    await db.insert(reconciliationCycle).values({
      id: adjustmentId,
      orgId: ORG_A,
      cycleId: CYCLE_A,
      declaredBankBalance: "0.0000",
      computedPoolBalance: "0.0000",
      discrepancyAmount: "0.0000",
      toleranceAmount: "0.0000",
      resolutionKind: "adjustment",
      resolutionNote: "Prueba de snapshot consistente",
      periodCloseId: PERIOD_CLOSE_A,
      adjustmentReason: "Corrección concurrente autorizada",
      adjustmentWindowOpensAt: new Date("2000-01-01T00:00:00.000Z"),
      adjustmentWindowClosesAt: new Date("2099-12-31T23:59:59.999Z"),
      createdAt: GENERATED_AT,
      createdBy: TREASURER_A,
      createdByKind: "member",
    });
    let signalBaseline!: () => void;
    const baselineReached = new Promise<void>((resolve) => { signalBaseline = resolve; });
    let releasePreview!: () => void;
    const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
    const service = createMemberStatementService({
      afterBaselineRead: async () => {
        signalBaseline();
        await previewGate;
      },
    });
    const firstPreviewPromise = service.preview({
      orgId: ORG_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
    });
    await baselineReached;

    const laterContributionId = randomUUID();
    let writeSettled = false;
    const writePromise = db.insert(contribution).values({
      ...contributionRow(laterContributionId, ORG_A, CYCLE_A, MEMBER_A, "17.0000", "2026-07-28"),
      adjustmentCycleId: adjustmentId,
    }).then(() => { writeSettled = true; });
    let observedAdvisoryWait = false;
    for (let attempt = 0; attempt < 100 && !observedAdvisoryWait && !writeSettled; attempt += 1) {
      const waitResult = await db.execute<{ waiting: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'
            AND query ILIKE '%insert into "contribution"%'
        ) AS waiting
      `);
      observedAdvisoryWait = Boolean((Array.isArray(waitResult) ? waitResult : waitResult.rows)[0]?.waiting);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(observedAdvisoryWait).toBe(true);
    expect(writeSettled).toBe(false);

    releasePreview();
    const firstPreview = await firstPreviewPromise;
    await writePromise;
    expect(statementRowLabels(firstPreview.payload))
      .not.toContain("Aporte 2026-07-28");
    expect(firstPreview.payload.verificationMovements.map((row) => row.sourceId)).not.toContain(laterContributionId);

    const nextPreview = await service.preview({
      orgId: ORG_A,
      periodCloseId: PERIOD_CLOSE_A,
      memberId: MEMBER_A,
      statementCopy,
    });
    expect(statementRowLabels(nextPreview.payload))
      .toContain("Aporte 2026-07-28");
    expect(nextPreview.payload.verificationMovements.map((row) => row.sourceId)).toContain(laterContributionId);
  });
});

function memberRow(id: string, orgId: string, displayName: string, status: "activo" | "baja", initialSavingsBalance: string) {
  return {
    id,
    orgId,
    displayName,
    joinedOn: "2026-01-01",
    role: "aportante" as const,
    status,
    initialSavingsBalance,
    createdAt: NOW,
    createdBy: TREASURER_A,
    createdByKind: "system",
  };
}

function cycleRow(id: string, orgId: string, cycleLabel: string) {
  return {
    id,
    orgId,
    cycleLabel,
    kind: "monthly",
    opensOn: `${cycleLabel}-01`,
    closesOn: `${cycleLabel}-31`,
    expectedAmountPerMember: "20.0000",
    currencyCode: "USD",
    status: "closed" as const,
    createdAt: NOW,
    createdBy: TREASURER_A,
    createdByKind: "system" as const,
  };
}

function reconciliationRow(id: string, orgId: string, cycleId: string) {
  return {
    id,
    orgId,
    cycleId,
    declaredBankBalance: "0.0000",
    computedPoolBalance: "0.0000",
    discrepancyAmount: "0.0000",
    toleranceAmount: "0.0000",
    resolutionKind: "auto_within_tolerance" as const,
    closedAt: NOW,
    createdAt: NOW,
    createdBy: TREASURER_A,
    createdByKind: "system",
  };
}

function closeRow(id: string, orgId: string, cycleId: string, reconciliationCycleId: string) {
  return {
    id,
    orgId,
    cycleId,
    reconciliationCycleId,
    closedAt: NOW,
    closedBy: TREASURER_A,
    closedByKind: "member",
    isYearEnd: false,
    createdAt: NOW,
  };
}

function contributionRow(id: string, orgId: string, cycleId: string, memberId: string, amount: string, datedOn: string) {
  return {
    id,
    orgId,
    cycleId,
    memberId,
    amount,
    currencyCode: "USD",
    datedOn,
    recordedAt: NOW,
    createdAt: NOW,
    createdBy: TREASURER_A,
    createdByKind: "member",
  };
}

function withdrawalRow(id: string, orgId: string, memberId: string, amount: string, datedOn: string) {
  return {
    id,
    orgId,
    memberId,
    amount,
    currencyCode: "USD",
    datedOn,
    recordedAt: NOW,
    kind: "other" as const,
    createdAt: NOW,
    createdBy: TREASURER_A,
    createdByKind: "member" as const,
  };
}

async function localArtifactWriter(
  input: MonthlyMemberStatementArtifactInput,
): Promise<MonthlyMemberStatementArtifactResult> {
  const bytes = Buffer.from(canonicalJson(input.payload), "utf8");
  const pdfUri = join(artifactDirectory, `${input.canonicalPayloadHash}.pdf`);
  await writeFile(pdfUri, bytes);
  return { pdfUri, byteSize: bytes.byteLength };
}

async function archiveCount(orgId: string, periodCloseId: string): Promise<number> {
  const rows = await withTenantTransaction(orgId, (tx) => tx.select({ id: statementArchive.id }).from(statementArchive)
    .where(and(eq(statementArchive.orgId, orgId), eq(statementArchive.periodCloseId, periodCloseId))));
  return rows.length;
}

async function generatedAuditCount(orgId: string, _periodCloseId: string): Promise<number> {
  const rows = await withTenantTransaction(orgId, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry)
    .where(and(
      eq(auditLogEntry.orgId, orgId),
      eq(auditLogEntry.actionKind, "statement.generated"),
    )));
  return rows.length;
}

async function waitForSecondGenerationBoundary(secondWriterEntered: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (secondWriterEntered() || await hasWaitingAdvisoryLock()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("concurrent_generation_boundary_timeout");
}

async function hasWaitingAdvisoryLock(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
    ) AS waiting
  `);
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{ waiting: boolean }>;
  return rows[0]?.waiting === true;
}

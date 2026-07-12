import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

import archiver from "archiver";
import { asc, desc, eq, getTableColumns } from "drizzle-orm";

import { withTenantTransaction } from "@mi-banquito/db/tenant";
import {
  auditLogEntry,
  baseFundQuotaConfig,
  baseFundQuotaPayment,
  contribution,
  expense,
  interestAccrual,
  loan,
  loanFee,
  loanReferral,
  member,
  organization,
  repayment,
  statementArchive,
  statementArtifactEvent,
  withdrawal,
} from "@mi-banquito/db/schema";

import { csvCell } from "./admin-audit";

type TableLike = Parameters<typeof getTableColumns>[0];
type AnyRow = Record<string, unknown>;

export async function loadTenantExportData(orgId: string) {
  return withTenantTransaction(orgId, async (tx) => {
    const [org] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)).limit(1);
    if (!org) throw new Error("organization_not_found");
    const members = await tx.select().from(member).where(eq(member.orgId, orgId)).orderBy(asc(member.id));
    const contributions = await tx.select().from(contribution).where(eq(contribution.orgId, orgId)).orderBy(asc(contribution.id));
    const withdrawals = await tx.select().from(withdrawal).where(eq(withdrawal.orgId, orgId)).orderBy(asc(withdrawal.id));
    const expenses = await tx.select().from(expense).where(eq(expense.orgId, orgId)).orderBy(asc(expense.id));
    const loans = await tx.select().from(loan).where(eq(loan.orgId, orgId)).orderBy(asc(loan.id));
    const repayments = await tx.select().from(repayment).where(eq(repayment.orgId, orgId)).orderBy(asc(repayment.id));
    const interestAccruals = await tx.select().from(interestAccrual).where(eq(interestAccrual.orgId, orgId)).orderBy(asc(interestAccrual.id));
    const baseFundQuotaConfigs = await tx.select().from(baseFundQuotaConfig).where(eq(baseFundQuotaConfig.orgId, orgId)).orderBy(asc(baseFundQuotaConfig.id));
    const baseFundQuotaPayments = await tx.select().from(baseFundQuotaPayment).where(eq(baseFundQuotaPayment.orgId, orgId)).orderBy(asc(baseFundQuotaPayment.id));
    const fees = await tx.select().from(loanFee).where(eq(loanFee.orgId, orgId)).orderBy(asc(loanFee.id));
    const referrals = await tx.select().from(loanReferral).where(eq(loanReferral.orgId, orgId)).orderBy(asc(loanReferral.id));
    const statementArchives = await tx.select().from(statementArchive).where(eq(statementArchive.orgId, orgId)).orderBy(asc(statementArchive.id));
    const artifactEvents = await tx.select().from(statementArtifactEvent)
      .where(eq(statementArtifactEvent.orgId, orgId))
      .orderBy(asc(statementArtifactEvent.statementArchiveId), desc(statementArtifactEvent.createdAt), desc(statementArtifactEvent.attemptNumber));
    const auditLog = await tx.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgId)).orderBy(asc(auditLogEntry.id));

    const latestArtifactStatus = new Map<string, (typeof artifactEvents)[number]["status"]>();
    for (const event of artifactEvents) {
      if (!latestArtifactStatus.has(event.statementArchiveId)) latestArtifactStatus.set(event.statementArchiveId, event.status);
    }
    for (const archive of statementArchives) {
      const status = latestArtifactStatus.get(archive.id);
      if (archive.byteSize <= 0 || (status !== undefined && status !== "ready")) {
        throw new Error(`statement_artifact_not_ready:${archive.id}`);
      }
    }

    return {
      members,
      contributions,
      withdrawals,
      expenses,
      loans,
      repayments,
      interestAccruals,
      baseFundQuotaConfigs,
      baseFundQuotaPayments,
      fees,
      referrals,
      statementArchives,
      auditLog,
    };
  });
}

export type TenantExportData = Awaited<ReturnType<typeof loadTenantExportData>>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return `{${Object.entries(value as AnyRow)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value) ?? "null";
}

function valueForCsv(value: unknown): unknown {
  return value && typeof value === "object" && !(value instanceof Date) ? stableJson(value) : value;
}

function csvForTable(table: TableLike, rows: readonly AnyRow[]) {
  const columns = Object.entries(getTableColumns(table));
  const header = columns.map(([, column]) => column.name).join(",");
  const body = rows.map((row) => columns.map(([property]) => csvCell(valueForCsv(row[property]))).join(","));
  return `${header}\r\n${body.length ? `${body.join("\r\n")}\r\n` : ""}`;
}

function databaseRow(table: TableLike, row: AnyRow): AnyRow {
  return Object.fromEntries(Object.entries(getTableColumns(table)).map(([property, column]) => [column.name, row[property]]));
}

function quotaCsv(data: TenantExportData): string {
  const rows = [
    ...data.baseFundQuotaConfigs.map((row) => ["config", stableJson(databaseRow(baseFundQuotaConfig, row))]),
    ...data.baseFundQuotaPayments.map((row) => ["payment", stableJson(databaseRow(baseFundQuotaPayment, row))]),
  ];
  return `record_kind,payload_json\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type TenantExportCsvFile = {
  name: string;
  contents: string;
  rowCount: number;
  sha256: string;
  sizeBytes: number;
};

export type TenantExportPdf = {
  name: string;
  archiveId: string;
  sha256: string;
  sizeBytes: number;
  source: () => Readable;
};

export type TenantExportManifest = {
  schemaVersion: 1;
  orgId: string;
  generatedAt: string;
  entityRowCounts: Record<string, number>;
  files: Record<string, { sha256: string; sizeBytes: number; rowCount?: number; statementArchiveId?: string }>;
};

export type TenantExportPlan = {
  csvFiles: TenantExportCsvFile[];
  pdfs: TenantExportPdf[];
  manifest: TenantExportManifest;
  readme: string;
};

const CSV_DEFINITIONS = [
  ["members", "members.csv", member, "members"],
  ["contributions", "contributions.csv", contribution, "contributions"],
  ["withdrawals", "withdrawals.csv", withdrawal, "withdrawals"],
  ["expenses", "expenses.csv", expense, "expenses"],
  ["loans", "loans.csv", loan, "loans"],
  ["repayments", "repayments.csv", repayment, "repayments"],
  ["interest_accruals", "interest_accruals.csv", interestAccrual, "interestAccruals"],
  ["fees", "fees.csv", loanFee, "fees"],
  ["referrals", "referrals.csv", loanReferral, "referrals"],
  ["statements", "statements.csv", statementArchive, "statementArchives"],
  ["audit_log", "audit_log.csv", auditLogEntry, "auditLog"],
] as const;

function readmeText(): string {
  return [
    "ESPAÑOL",
    "Este archivo contiene la exportación completa de los datos de la organización.",
    "manifest.json incluye los conteos y hashes SHA-256 para verificar la integridad de cada CSV y PDF.",
    "Los valores se exportan en UTF-8 y los CSV siguen RFC 4180.",
    "",
    "ENGLISH",
    "This archive contains the complete organization data export.",
    "manifest.json contains row counts and SHA-256 hashes for integrity verification of every CSV and PDF.",
    "Values are UTF-8 and CSV files follow RFC 4180.",
    "",
  ].join("\n");
}

export function buildTenantExportPlan(input: {
  orgId: string;
  generatedAt: Date;
  data: TenantExportData;
  pdfs: TenantExportPdf[];
}): TenantExportPlan {
  const csvFiles = CSV_DEFINITIONS.map(([entity, name, table, property]) => {
    const rows = input.data[property] as readonly AnyRow[];
    const contents = csvForTable(table, rows);
    return { entity, name, contents, rowCount: rows.length, sha256: sha256(contents), sizeBytes: Buffer.byteLength(contents) };
  });
  const quotaFiles = [
    {
      entity: "base_fund_quotas",
      name: "base_fund_quotas.csv",
      contents: quotaCsv(input.data),
      rowCount: input.data.baseFundQuotaConfigs.length + input.data.baseFundQuotaPayments.length,
    },
    {
      entity: "base_fund_quota_configs",
      name: "base_fund_quota_configs.csv",
      contents: csvForTable(baseFundQuotaConfig, input.data.baseFundQuotaConfigs),
      rowCount: input.data.baseFundQuotaConfigs.length,
    },
    {
      entity: "base_fund_quota_payments",
      name: "base_fund_quota_payments.csv",
      contents: csvForTable(baseFundQuotaPayment, input.data.baseFundQuotaPayments),
      rowCount: input.data.baseFundQuotaPayments.length,
    },
  ].map((file) => ({ ...file, sha256: sha256(file.contents), sizeBytes: Buffer.byteLength(file.contents) }));
  const allCsv = [...csvFiles, ...quotaFiles].sort((left, right) => left.name.localeCompare(right.name));
  const entityRowCounts = Object.fromEntries([...csvFiles, ...quotaFiles].map((file) => [file.entity, file.rowCount]));
  const files: TenantExportManifest["files"] = {};
  for (const file of allCsv) files[file.name] = { sha256: file.sha256, sizeBytes: file.sizeBytes, rowCount: file.rowCount };
  for (const pdf of [...input.pdfs].sort((left, right) => left.name.localeCompare(right.name))) {
    files[pdf.name] = { sha256: pdf.sha256, sizeBytes: pdf.sizeBytes, statementArchiveId: pdf.archiveId };
  }
  return {
    csvFiles: allCsv,
    pdfs: [...input.pdfs].sort((left, right) => left.name.localeCompare(right.name)),
    manifest: {
      schemaVersion: 1,
      orgId: input.orgId,
      generatedAt: input.generatedAt.toISOString(),
      entityRowCounts,
      files,
    },
    readme: readmeText(),
  };
}

export type ArchiveFactory = typeof archiver;

export function createTenantExportArchive(plan: TenantExportPlan, archiveFactory: ArchiveFactory = archiver) {
  const archive = archiveFactory("zip", { zlib: { level: 6 } });
  for (const file of plan.csvFiles) archive.append(file.contents, { name: file.name });
  for (const pdf of plan.pdfs) archive.append(pdf.source(), { name: pdf.name });
  archive.append(`${JSON.stringify(plan.manifest, null, 2)}\n`, { name: "manifest.json" });
  archive.append(plan.readme, { name: "README.txt" });
  const completion = archive.finalize().then(() => undefined);
  return { stream: archive as Readable, completion };
}

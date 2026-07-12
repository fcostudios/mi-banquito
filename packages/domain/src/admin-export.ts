import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";

import archiver from "archiver";
import { and, asc, desc, eq, getTableColumns, gt } from "drizzle-orm";

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
type StatementArchiveRow = typeof statementArchive.$inferSelect;

export const TENANT_EXPORT_PAGE_SIZE = 250;

export type TenantExportStagedFile = {
  name: string;
  path: string;
  rowCount: number;
  sha256: string;
  sizeBytes: number;
};

export type TenantExportStagedEntityFile = TenantExportStagedFile & { entity: string };

export type TenantExportStagedPdf = {
  name: string;
  path: string;
  archiveId: string;
  sha256: string;
  sizeBytes: number;
};

class HashedFileWriter {
  private readonly hash = createHash("sha256");
  private sizeBytes = 0;

  private constructor(
    private readonly handle: FileHandle,
    readonly path: string,
  ) {}

  static async create(path: string) {
    return new HashedFileWriter(await open(path, "wx"), path);
  }

  async write(value: string) {
    const bytes = Buffer.from(value, "utf8");
    this.hash.update(bytes);
    this.sizeBytes += bytes.byteLength;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await this.handle.write(bytes, offset, bytes.byteLength - offset);
      offset += bytesWritten;
    }
  }

  async finish() {
    await this.handle.close();
    return { sha256: this.hash.digest("hex"), sizeBytes: this.sizeBytes };
  }

  async abort() {
    await this.handle.close().catch(() => undefined);
  }
}

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

function databaseRow(table: TableLike, row: AnyRow): AnyRow {
  return Object.fromEntries(Object.entries(getTableColumns(table)).map(([property, column]) => [column.name, row[property]]));
}

export type TenantExportManifest = {
  schemaVersion: 1;
  orgId: string;
  generatedAt: string;
  entityRowCounts: Record<string, number>;
  files: Record<string, { sha256: string; sizeBytes: number; rowCount?: number; statementArchiveId?: string }>;
};

export type TenantExportPlan = {
  csvFiles: TenantExportStagedFile[];
  pdfs: TenantExportStagedPdf[];
  manifest: TenantExportManifest;
  readme: string;
};

const CSV_DEFINITIONS = [
  ["members", "members.csv", member],
  ["contributions", "contributions.csv", contribution],
  ["withdrawals", "withdrawals.csv", withdrawal],
  ["expenses", "expenses.csv", expense],
  ["loans", "loans.csv", loan],
  ["repayments", "repayments.csv", repayment],
  ["interest_accruals", "interest_accruals.csv", interestAccrual],
  ["fees", "fees.csv", loanFee],
  ["referrals", "referrals.csv", loanReferral],
  ["statements", "statements.csv", statementArchive],
  ["audit_log", "audit_log.csv", auditLogEntry],
] as const;

const STAGED_CSV_DEFINITIONS = [
  ...CSV_DEFINITIONS.map(([entity, name, table]) => ({ entity, name, table })),
  { entity: "base_fund_quota_configs", name: "base_fund_quota_configs.csv", table: baseFundQuotaConfig },
  { entity: "base_fund_quota_payments", name: "base_fund_quota_payments.csv", table: baseFundQuotaPayment },
] as const;

function statementName(input: StatementArchiveRow) {
  const period = input.periodLabel.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `statements/${input.kind}-${period}-${input.id}.pdf`;
}

async function stageTableCsv(input: {
  orgId: string;
  directory: string;
  entity: string;
  name: string;
  table: TableLike;
  pageSize: number;
  onPage?: (page: { entity: string; size: number }) => void;
  onRow?: (row: AnyRow, tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0]) => Promise<void>;
}): Promise<TenantExportStagedFile> {
  const writer = await HashedFileWriter.create(join(input.directory, input.name));
  const columns = Object.entries(getTableColumns(input.table));
  const columnMap = getTableColumns(input.table) as Record<string, Parameters<typeof eq>[0]>;
  const idColumn = columnMap.id;
  const orgColumn = columnMap.orgId;
  if (!idColumn || !orgColumn) throw new Error(`tenant_export_table_invalid:${input.entity}`);
  let rowCount = 0;

  try {
    await writer.write(`${columns.map(([, column]) => column.name).join(",")}\r\n`);
    await withTenantTransaction(input.orgId, async (tx) => {
      let cursor: string | undefined;
      do {
        const queryTable = input.table as typeof member;
        const rows = await tx.select().from(queryTable).where(and(
          eq(orgColumn, input.orgId),
          cursor ? gt(idColumn, cursor) : undefined,
        )).orderBy(asc(idColumn)).limit(input.pageSize) as unknown as AnyRow[];
        if (rows.length === 0) break;
        input.onPage?.({ entity: input.entity, size: rows.length });
        for (const row of rows) {
          await writer.write(`${columns.map(([property]) => csvCell(valueForCsv(row[property]))).join(",")}\r\n`);
          await input.onRow?.(row, tx);
          rowCount += 1;
        }
        cursor = String(rows[rows.length - 1]!.id);
        if (rows.length < input.pageSize) break;
      } while (cursor);
    });
    return { name: input.name, path: writer.path, rowCount, ...await writer.finish() };
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

export async function stageTenantExportFiles(input: {
  orgId: string;
  directory: string;
  pageSize?: number;
  onPage?: (page: { entity: string; size: number }) => void;
  stagePdf: (archive: StatementArchiveRow, path: string) => Promise<{ sha256: string; sizeBytes: number }>;
}) {
  const pageSize = input.pageSize ?? TENANT_EXPORT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > TENANT_EXPORT_PAGE_SIZE) {
    throw new Error("tenant_export_page_size_invalid");
  }
  await withTenantTransaction(input.orgId, async (tx) => {
    const [org] = await tx.select({ id: organization.id }).from(organization)
      .where(eq(organization.id, input.orgId)).limit(1);
    if (!org) throw new Error("organization_not_found");
  });

  const pdfs: TenantExportStagedPdf[] = [];
  const csvFiles: Array<TenantExportStagedFile & { entity: string }> = [];
  for (const definition of STAGED_CSV_DEFINITIONS) {
    const staged = await stageTableCsv({
      ...input,
      ...definition,
      pageSize,
      onRow: definition.table === statementArchive ? async (value, tx) => {
        const archive = value as StatementArchiveRow;
        const [latest] = await tx.select({ status: statementArtifactEvent.status })
          .from(statementArtifactEvent)
          .where(and(
            eq(statementArtifactEvent.orgId, input.orgId),
            eq(statementArtifactEvent.statementArchiveId, archive.id),
          ))
          .orderBy(desc(statementArtifactEvent.createdAt), desc(statementArtifactEvent.attemptNumber))
          .limit(1);
        if (archive.byteSize <= 0 || (latest && latest.status !== "ready")) {
          throw new Error(`statement_artifact_not_ready:${archive.id}`);
        }
        const path = join(input.directory, `${archive.id}.pdf`);
        const result = await input.stagePdf(archive, path);
        if (result.sizeBytes !== archive.byteSize) {
          throw new Error(`statement_artifact_size_mismatch:${archive.id}`);
        }
        pdfs.push({
          name: statementName(archive),
          path,
          archiveId: archive.id,
          ...result,
        });
      } : undefined,
    });
    csvFiles.push({ ...staged, entity: definition.entity });
  }

  const quotaWriter = await HashedFileWriter.create(join(input.directory, "base_fund_quotas.csv"));
  let quotaRows = 0;
  try {
    await quotaWriter.write("record_kind,payload_json\r\n");
    for (const [recordKind, table] of [["config", baseFundQuotaConfig], ["payment", baseFundQuotaPayment]] as const) {
      await withTenantTransaction(input.orgId, async (tx) => {
        const columns = getTableColumns(table);
        let cursor: string | undefined;
        do {
          const queryTable = table as unknown as typeof member;
          const rows = await tx.select().from(queryTable).where(and(
            eq(columns.orgId, input.orgId),
            cursor ? gt(columns.id, cursor) : undefined,
          )).orderBy(asc(columns.id)).limit(pageSize) as unknown as AnyRow[];
          if (rows.length === 0) break;
          input.onPage?.({ entity: "base_fund_quotas", size: rows.length });
          for (const row of rows) {
            await quotaWriter.write(`${csvCell(recordKind)},${csvCell(stableJson(databaseRow(table, row)))}\r\n`);
            quotaRows += 1;
          }
          cursor = String(rows[rows.length - 1]!.id);
          if (rows.length < pageSize) break;
        } while (cursor);
      });
    }
    csvFiles.push({
      entity: "base_fund_quotas",
      name: "base_fund_quotas.csv",
      path: quotaWriter.path,
      rowCount: quotaRows,
      ...await quotaWriter.finish(),
    });
  } catch (error) {
    await quotaWriter.abort();
    throw error;
  }

  return {
    csvFiles: csvFiles.sort((left, right) => left.name.localeCompare(right.name)),
    pdfs: pdfs.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

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

export function buildStagedTenantExportPlan(input: {
  orgId: string;
  generatedAt: Date;
  csvFiles: TenantExportStagedEntityFile[];
  pdfs: TenantExportStagedPdf[];
}): TenantExportPlan {
  const csvFiles = [...input.csvFiles].sort((left, right) => left.name.localeCompare(right.name));
  const pdfs = [...input.pdfs].sort((left, right) => left.name.localeCompare(right.name));
  const entityRowCounts = Object.fromEntries(csvFiles.map((file) => [file.entity, file.rowCount]));
  const files: TenantExportManifest["files"] = {};
  for (const file of csvFiles) {
    files[file.name] = { sha256: file.sha256, sizeBytes: file.sizeBytes, rowCount: file.rowCount };
  }
  for (const pdf of pdfs) {
    files[pdf.name] = {
      sha256: pdf.sha256,
      sizeBytes: pdf.sizeBytes,
      statementArchiveId: pdf.archiveId,
    };
  }
  return {
    csvFiles,
    pdfs,
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
  for (const file of plan.csvFiles) {
    archive.append(createReadStream(file.path), { name: file.name });
  }
  for (const pdf of plan.pdfs) {
    archive.append(createReadStream(pdf.path), { name: pdf.name });
  }
  archive.append(`${JSON.stringify(plan.manifest, null, 2)}\n`, { name: "manifest.json" });
  archive.append(plan.readme, { name: "README.txt" });
  const completion = archive.finalize().then(() => undefined);
  return { stream: archive as Readable, completion };
}

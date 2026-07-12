import Link from "next/link";

import type { AdminGlobalDrift, AdminHealthSnapshot } from "@mi-banquito/domain";
import { KpiTile, StatusPill } from "@mi-banquito/ui";

import { ecDateTime } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.adminHealth;
const healthCopy = {
  consecutiveCleanMonths: "Meses consecutivos sin drift",
  stale: "Datos vencidos",
  unknown: "Estado desconocido",
} as const;

function money(amount: string, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function dateTime(value: Date | null, fallback: string): string {
  return value ? ecDateTime.format(value) : fallback;
}

export function AdminHealthDashboard({ snapshots, drift, consecutiveCleanMonths }: {
  snapshots: AdminHealthSnapshot[];
  drift: AdminGlobalDrift | null;
  consecutiveCleanMonths: number;
}) {
  const latestDrift = drift?.exitCode ?? null;
  const driftClean = latestDrift === 0;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3" data-testid="kpi_strip" aria-label={copy.metrics}>
        <div className="rounded-md border border-border" data-testid="orgs_total">
          <KpiTile labelKey={copy.activeOrganizations} value={String(snapshots.filter((row) => row.status === "active").length)} />
        </div>
        <div className="rounded-md border border-border" data-testid="consecutive_clean_months">
          <KpiTile labelKey={healthCopy.consecutiveCleanMonths} value={String(consecutiveCleanMonths)} />
        </div>
        <div className="rounded-md border border-border bg-surface p-4" data-testid="drift_badge">
          <p className="mb-2 text-text-secondary">{copy.substrateStatus}</p>
          <StatusPill
            tone={driftClean ? "success" : latestDrift === null ? "neutral" : "danger"}
            label={latestDrift === null ? copy.notChecked : driftClean ? copy.noDrift : copy.driftDetected}
          />
        </div>
      </section>

      {snapshots.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">{copy.empty}</p>
      ) : (
        <section className="overflow-x-auto rounded-md border border-border bg-surface" data-testid="orgs_table">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-text-secondary">
              <tr>
                <th className="px-3 py-3 font-medium">{copy.organization}</th>
                <th className="px-3 py-3 font-medium">{copy.lastActivity}</th>
                <th className="px-3 py-3 font-medium">{copy.lastClose}</th>
                <th className="px-3 py-3 font-medium">{copy.reconciliation}</th>
                <th className="px-3 py-3 font-medium">{copy.openLoans}</th>
                <th className="px-3 py-3 font-medium">{copy.arTotal}</th>
                <th className="px-3 py-3 font-medium">{copy.drift}</th>
                <th className="px-3 py-3 font-medium">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((row) => {
                const rowDriftClean = row.driftExitCode === 0;
                const healthReliable = row.snapshotStatus === "available"
                  && row.freshness === "current"
                  && row.hasPendingReconciliation !== null
                  && row.openLoansCount !== null
                  && row.arTotal !== null;
                const healthStatusLabel = row.freshness === "stale" ? healthCopy.stale : healthCopy.unknown;
                return (
                  <tr key={row.orgId} className="border-b border-border align-top last:border-b-0" data-testid={`org-row-${row.orgId}`}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-text-primary">{row.displayName}</p>
                      <p className="mt-1 font-mono text-xs text-text-secondary">{row.orgId}</p>
                      {!healthReliable ? (
                        <span className="mt-2 inline-block">
                          <StatusPill tone="danger" label={healthStatusLabel} />
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-text-secondary">
                      {healthReliable ? dateTime(row.lastActivityAt, copy.noActivity) : healthStatusLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-text-secondary">
                      {healthReliable ? dateTime(row.lastCloseAt, copy.noClose) : healthStatusLabel}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        tone={!healthReliable || row.hasPendingReconciliation ? "danger" : "success"}
                        label={!healthReliable ? healthStatusLabel : row.hasPendingReconciliation ? copy.pending : copy.current}
                      />
                    </td>
                    <td className="px-3 py-3 text-text-primary">
                      {healthReliable && row.openLoansCount !== null ? row.openLoansCount : healthStatusLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-text-primary">
                      {healthReliable && row.arTotal !== null ? money(row.arTotal, row.currencyCode) : healthStatusLabel}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        tone={rowDriftClean ? "success" : row.driftExitCode === null ? "neutral" : "danger"}
                        label={row.driftExitCode === null ? copy.notChecked : rowDriftClean ? copy.noDrift : copy.driftDetected}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-max gap-3">
                        <Link className="text-primary hover:underline" href={`/admin/orgs/${row.orgId}`}>{copy.detail}</Link>
                        <Link className="text-primary hover:underline" href={`/admin/orgs/${row.orgId}/impersonate`}>{copy.impersonate}</Link>
                        <Link className="text-primary hover:underline" href={`/admin/orgs/${row.orgId}/export`}>{copy.export}</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

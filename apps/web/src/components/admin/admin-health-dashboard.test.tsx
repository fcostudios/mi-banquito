import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminHealthSnapshot } from "@mi-banquito/domain";
import { AdminHealthDashboard } from "./admin-health-dashboard";

const runnerReady = { ready: true, mode: "remote", code: "remote_runner_ready" } as const;

const base = {
  status: "active" as const,
  currencyCode: "USD",
  lastCloseAt: new Date("2026-06-30T20:00:00.000Z"),
  openLoansCount: 1,
  refreshedAt: new Date("2026-07-12T11:00:00.000Z"),
  driftExitCode: 2,
  driftCheckedAt: new Date("2026-07-12T10:00:00.000Z"),
  driftRawText: "DRIFT routes\n",
  snapshotStatus: "available" as const,
  freshness: "current" as const,
};

const snapshots: AdminHealthSnapshot[] = [
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111111",
    orgId: "11111111-1111-4111-8111-111111111111",
    displayName: "Banquito pendiente",
    lastActivityAt: new Date("2026-07-11T10:00:00.000Z"),
    hasPendingReconciliation: true,
    arTotal: "125.5000",
  },
  {
    ...base,
    id: "22222222-2222-4222-8222-222222222222",
    orgId: "22222222-2222-4222-8222-222222222222",
    displayName: "Banquito limpio",
    lastActivityAt: null,
    lastCloseAt: null,
    hasPendingReconciliation: false,
    openLoansCount: 0,
    arTotal: "0.0000",
  },
];

describe("AdminHealthDashboard", () => {
  it("renders isolated health metrics, global drift, and every org action", () => {
    render(<AdminHealthDashboard snapshots={snapshots} consecutiveCleanMonths={3} runnerDeployment={runnerReady} drift={{
      exitCode: 2,
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      rawText: "DRIFT routes\n",
    }} />);

    expect(within(screen.getByTestId("orgs_total")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("consecutive_clean_months")).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByTestId("consecutive_clean_months")).getByText("Meses con conciliación cero")).toBeInTheDocument();
    expect(within(screen.getByTestId("drift_badge")).getByText("Drift detectado")).toBeInTheDocument();
    const pendingRow = screen.getByTestId(`org-row-${snapshots[0].orgId}`);
    const cleanRow = screen.getByTestId(`org-row-${snapshots[1].orgId}`);
    expect(within(pendingRow).getByText("Pendiente")).toBeInTheDocument();
    expect(within(pendingRow).getByText("$125.50")).toBeInTheDocument();
    expect(within(cleanRow).getByText("Al día")).toBeInTheDocument();
    expect(within(cleanRow).getByText("$0.00")).toBeInTheDocument();
    expect(within(cleanRow).getByText("Sin actividad")).toBeInTheDocument();
    expect(within(cleanRow).getByText("Sin cierre")).toBeInTheDocument();

    expect(within(pendingRow).getByRole("link", { name: "Detalle" })).toHaveAttribute(
      "href",
      `/admin/orgs/${snapshots[0].orgId}`,
    );
    expect(within(pendingRow).getByRole("link", { name: "Impersonar" })).toHaveAttribute(
      "href",
      `/admin/orgs/${snapshots[0].orgId}/impersonate`,
    );
    expect(within(pendingRow).getByRole("link", { name: "Exportar" })).toHaveAttribute(
      "href",
      `/admin/orgs/${snapshots[0].orgId}/export`,
    );
  });

  it("renders persisted global drift when there are no organizations", () => {
    render(<AdminHealthDashboard snapshots={[]} consecutiveCleanMonths={0} runnerDeployment={runnerReady} drift={{
      exitCode: 9,
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      rawText: "DRIFT before tenant provisioning\n",
    }} />);

    expect(within(screen.getByTestId("drift_badge")).getByText("Drift detectado")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay organizaciones registradas.")).toBeInTheDocument();
  });

  it("fails closed for global and per-organization clean results when the runner is unavailable", () => {
    const cleanSnapshot: AdminHealthSnapshot = {
      ...snapshots[1],
      driftExitCode: 0,
      driftRawText: "clean\n",
    };

    render(<AdminHealthDashboard
      snapshots={[cleanSnapshot]}
      consecutiveCleanMonths={0}
      drift={{
        exitCode: 0,
        checkedAt: new Date("2026-07-12T10:00:00.000Z"),
        rawText: "clean\n",
      }}
      runnerDeployment={{ ready: false, mode: "unavailable", code: "remote_runner_missing" }}
    />);

    expect(within(screen.getByTestId("drift_badge")).getByText("Runner no disponible"))
      .toHaveClass("status-pill--error-bg");
    expect(within(screen.getByTestId("drift_badge")).queryByText("Sin drift")).not.toBeInTheDocument();
    const row = screen.getByTestId(`org-row-${cleanSnapshot.orgId}`);
    expect(within(row).getByText("Runner no disponible")).toHaveClass("status-pill--error-bg");
    expect(within(row).queryByText("Sin drift")).not.toBeInTheDocument();
  });

  it.each([
    {
      freshness: "unknown" as const,
      snapshotStatus: "missing" as const,
      label: "Estado desconocido",
      refreshedAt: null,
    },
    {
      freshness: "stale" as const,
      snapshotStatus: "available" as const,
      label: "Datos vencidos",
      refreshedAt: new Date("2026-07-10T00:00:00.000Z"),
    },
  ])("fails closed for $freshness health data", ({ freshness, snapshotStatus, label, refreshedAt }) => {
    const snapshot: AdminHealthSnapshot = {
      ...snapshots[1],
      freshness,
      snapshotStatus,
      refreshedAt,
      hasPendingReconciliation: freshness === "unknown" ? null : false,
      openLoansCount: freshness === "unknown" ? null : 0,
      arTotal: freshness === "unknown" ? null : "0.0000",
    };

    render(<AdminHealthDashboard snapshots={[snapshot]} consecutiveCleanMonths={0} drift={null} runnerDeployment={runnerReady} />);

    const row = screen.getByTestId(`org-row-${snapshot.orgId}`);
    expect(within(row).getAllByText(label).length).toBeGreaterThan(0);
    expect(within(row).queryByText("Al día")).not.toBeInTheDocument();
    expect(within(row).queryByText("$0.00")).not.toBeInTheDocument();
    expect(within(row).queryByText(/^0$/)).not.toBeInTheDocument();
  });
});

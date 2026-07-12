import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminDriftView } from "./admin-drift-view";

describe("AdminDriftView", () => {
  it("derives red status from persisted exit code and shows the raw report verbatim", () => {
    const rawText = "SECTION routes\n  mismatch /api/v1/x\n\nSECTION schema\n  clean\n";
    render(<AdminDriftView runnerDeployment={{ ready: true, mode: "remote", code: "remote_runner_ready" }} result={{
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      exitCode: 2,
      status: "drift",
      stdout: rawText,
      stderr: "",
      rawText,
      runnerKind: "local",
    }} />);

    expect(screen.getByText("Drift detectado")).toBeInTheDocument();
    expect(screen.getByTestId("runner_config")).toHaveTextContent("Runner remoto configurado");
    expect(screen.getByText(/12\/07\/2026/)).toBeInTheDocument();
    expect(screen.getByTestId("raw-report").textContent).toBe(rawText);
    fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
    expect(screen.getByText("El último chequeo terminó con código 2.")).toBeInTheDocument();
  });

  it("supports roving tab focus, arrow navigation, and owned tab panels", () => {
    render(<AdminDriftView runnerDeployment={{ ready: true, mode: "remote", code: "remote_runner_ready" }} result={{
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      exitCode: 2,
      status: "drift",
      stdout: "drift",
      stderr: "",
      rawText: "drift",
      runnerKind: "remote",
    }} />);

    const summary = screen.getByRole("tab", { name: "Resumen" });
    const full = screen.getByRole("tab", { name: "Reporte completo" });
    expect(full).toHaveAttribute("tabindex", "0");
    expect(summary).toHaveAttribute("tabindex", "-1");
    expect(full).toHaveAttribute("aria-controls", "drift-panel-full");

    full.focus();
    fireEvent.keyDown(full, { key: "ArrowLeft" });
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Resumen" })).toBeVisible();

    fireEvent.keyDown(summary, { key: "End" });
    expect(full).toHaveFocus();
    fireEvent.keyDown(full, { key: "Home" });
    expect(summary).toHaveFocus();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2);
  });

  it("renders green only for a persisted zero exit code", () => {
    render(<AdminDriftView runnerDeployment={{ ready: false, mode: "unavailable", code: "remote_runner_missing" }} result={{
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      exitCode: 0,
      status: "drift",
      stdout: "clean",
      stderr: "",
      rawText: "clean",
      runnerKind: "remote",
    }} />);

    expect(screen.getByText("Sin drift")).toBeInTheDocument();
    expect(screen.getByTestId("runner_config")).toHaveTextContent("Runner no disponible");
    expect(screen.queryByText("Drift detectado")).not.toBeInTheDocument();
  });

  it("builds and copies a complete IMP template without inventing a route", async () => {
    const rawText = "SECTION routes\n- missing /admin/example\n";
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<AdminDriftView runnerDeployment={{ ready: true, mode: "remote", code: "remote_runner_ready" }} result={{
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      exitCode: 6,
      status: "drift",
      stdout: rawText,
      stderr: "",
      rawText,
      runnerKind: "remote",
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear IMP desde este drift" }));
    const dialog = screen.getByRole("dialog", { name: "Plantilla de IMP" });
    const template = screen.getByRole("textbox", { name: "Plantilla completa de IMP" });
    const templateValue = (template as HTMLTextAreaElement).value;
    expect(dialog).toBeInTheDocument();
    expect(templateValue).toContain("2026-07-12T10:00:00.000Z");
    expect(templateValue).toContain("Exit code: 6");
    expect(templateValue).toContain("Runner: remote");
    expect(templateValue).toContain(rawText);
    expect(templateValue).toContain("Required outcome");

    fireEvent.click(screen.getByRole("button", { name: "Copiar plantilla" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(templateValue));
    expect(screen.queryByRole("link", { name: "Crear IMP desde este drift" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("traps dialog focus, closes with Escape, and restores the trigger", async () => {
    render(<AdminDriftView runnerDeployment={{ ready: true, mode: "remote", code: "remote_runner_ready" }} result={{
      checkedAt: new Date("2026-07-12T10:00:00.000Z"),
      exitCode: 2,
      status: "drift",
      stdout: "drift",
      stderr: "",
      rawText: "drift",
      runnerKind: "remote",
    }} />);

    const trigger = screen.getByRole("button", { name: "Crear IMP desde este drift" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Plantilla de IMP" });
    const close = screen.getByRole("button", { name: "Cerrar" });
    const copy = screen.getByRole("button", { name: "Copiar plantilla" });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(copy).toHaveFocus();
    fireEvent.keyDown(copy, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

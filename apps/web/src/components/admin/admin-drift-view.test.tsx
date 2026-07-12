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
});

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./header";

vi.mock("@/app/(authenticated)/alerts/actions", () => ({
  dismissAlertAction: vi.fn(),
  snoozeAlertAction: vi.fn(),
}));

const copy = {
  appName: "Mi Banquito",
  subtitle: "Panel de tesorería",
  fallbackUser: "Usuario",
  alertsLabel: "Notificaciones",
  emptyAlerts: "No hay alertas pendientes.",
  dismiss: "Descartar",
  snooze: "Recordar en 7 días",
  shareWhatsApp: "Enviar por WhatsApp",
  orgPrefix: "Org",
};

describe("Header", () => {
  it("shows the active organization context when one is selected", () => {
    render(
      <Header
        displayName="Pancho"
        email="pancho@fcostudios.io"
        activeOrgLabel="Mi Banquito FcoStudios"
        alertCount={0}
        alerts={[]}
        copy={copy}
      />,
    );

    expect(screen.getByText("Org: Mi Banquito FcoStudios")).toBeInTheDocument();
  });
});

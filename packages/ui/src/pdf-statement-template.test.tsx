// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfStatementTemplate } from "./organisms/pdf-statement-template";

describe("PdfStatementTemplate", () => {
  it("renders rich monthly, member, and year-end evidence sections", () => {
    render(
      <PdfStatementTemplate
        title="Estado de cuenta"
        sections={[
          {
            id: "member-monthly",
            title: "Movimiento mensual",
            rows: [
              { label: "Saldo inicial", value: "$100.00" },
              { label: "Comprobante", value: "Foto", href: "https://example.com/slip.jpg" },
              { label: "Saldo final", value: "$120.00" },
            ],
          },
          {
            id: "monthly-close",
            title: "Cierre del mes",
            rows: [
              { label: "Resumen por socia", value: "Pancho +$20.00" },
              { label: "Préstamos abiertos", value: "1" },
              { label: "Alertas activas", value: "A7" },
            ],
          },
          {
            id: "year-end",
            title: "Reparto fin de año",
            rows: [
              { label: "Saldo ponderado", value: "3000 USD-días" },
              { label: "Explicación", value: "Tu participación es proporcional al tiempo que tu dinero estuvo en el fondo durante el año, no al saldo acumulado." },
              { label: "Override", value: "Aprobado por acta" },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Estado de cuenta" })).toBeInTheDocument();
    const monthly = screen.getByText("Movimiento mensual").closest("section");
    expect(monthly).not.toBeNull();
    expect(within(monthly as HTMLElement).getByRole("link", { name: "Foto" })).toHaveAttribute("href", "https://example.com/slip.jpg");
    expect(screen.getByText("Resumen por socia")).toBeInTheDocument();
    expect(screen.getByText("Tu participación es proporcional al tiempo que tu dinero estuvo en el fondo durante el año, no al saldo acumulado.")).toBeInTheDocument();
  });
});

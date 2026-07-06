// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { YearEndShareOutEditor } from "./organisms/year-end-share-out-editor";

describe("YearEndShareOutEditor", () => {
  it("renders draft rows and approval controls", () => {
    render(
      <YearEndShareOutEditor
        shareOut={{
          id: "shareout-1",
          year: 2026,
          status: "draft",
          repartoTotal: "100.0000",
          loanPoolAmount: "30.0000",
          savingsPoolAmount: "70.0000",
          ajusteAmount: "0.0000",
        }}
        lines={[{
          id: "line-1",
          memberName: "Ana Mora",
          accumulatedSavingsAtRun: "100.0000",
          loanActivityBasis: "300.0000",
          loanBonusC: "9.0000",
          savingsInterest: "17.5000",
          draftShareAmount: "26.5000",
          overrideReason: null,
          finalShareAmount: "26.5000",
        }]}
        labels={{
          year: "Año",
          total: "Reparto total",
          loanPool: "Pool préstamos",
          adjustment: "Ajuste",
          member: "Socia",
          savings: "Ahorros",
          loanActivity: "Actividad préstamo",
          draft: "Draft",
          final: "Final",
          override: "Override",
          saveOverride: "Guardar override",
          approve: "Aprobar reparto",
          reasonPlaceholder: "Razón",
          finalAmountForMember: (memberName) => `Monto final ${memberName}`,
          reasonForMember: (memberName) => `Razón ${memberName}`,
        }}
        overrideAction={vi.fn()}
        approveAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Ana Mora")).toBeInTheDocument();
    expect(screen.getAllByText("USD 100.00").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Monto final Ana Mora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar reparto" })).toBeInTheDocument();
  });
});

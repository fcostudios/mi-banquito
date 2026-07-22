import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollectionForms, exceedsMoney4Ceiling, type CollectionScreenModel } from "./collection-forms";

const action = vi.fn(async (_formData: FormData) => undefined);
const actions = {
  open: action,
  addLine: action,
  reverseLine: action,
  regularize: action,
  payout: action,
  cancel: action,
  closeRecognition: action,
};

function model(overrides: Partial<CollectionScreenModel["selected"]> = {}): CollectionScreenModel {
  return {
    today: "2026-07-21",
    recognitionFiscalYear: 2026,
    search: {},
    requestIds: {
      open: "10000000-0000-4000-8000-000000000001",
      addLine: "10000000-0000-4000-8000-000000000002",
      payout: "10000000-0000-4000-8000-000000000005",
      cancel: "10000000-0000-4000-8000-000000000006",
      closeRecognition: "10000000-0000-4000-8000-000000000007",
    },
    lineRequestIds: {
      "50000000-0000-4000-8000-000000000001": {
        reverse: "10000000-0000-4000-8000-000000000003",
        regularize: "10000000-0000-4000-8000-000000000004",
      },
    },
    members: [
      { id: "20000000-0000-4000-8000-000000000001", name: "Ana Mora" },
      { id: "20000000-0000-4000-8000-000000000002", name: "Rosa Tituaña" },
      { id: "20000000-0000-4000-8000-000000000003", name: "María Quishpe" },
      { id: "20000000-0000-4000-8000-000000000004", name: "Lucía Vega" },
    ],
    accounts: [
      { id: "30000000-0000-4000-8000-000000000001", name: "Banco del grupo", isGroupFund: true },
      { id: "30000000-0000-4000-8000-000000000002", name: "Cuenta personal", isGroupFund: false },
    ],
    collections: [{ id: "40000000-0000-4000-8000-000000000001", purpose: "Calamidad doméstica", status: "collecting" }],
    selected: {
      id: "40000000-0000-4000-8000-000000000001",
      kind: "solidarity",
      purpose: "Calamidad doméstica",
      beneficiaryName: "Rosa Tituaña",
      targetAmount: "40.0000",
      status: "collecting",
      progress: {
        contributors: 3,
        activeMembers: 4,
        collected: "30.0000",
        regularized: "20.0000",
        pending: "10.0000",
      },
      surplusAmount: null,
      disposition: null,
      dispositionMotive: null,
      lines: [{
        id: "50000000-0000-4000-8000-000000000001",
        memberName: "María Quishpe",
        amount: "10.0000",
        accountName: "Cuenta personal",
        accountId: "30000000-0000-4000-8000-000000000002",
        remaining: "10.0000",
        reconciliationStatus: "pending",
        reversesId: null,
      }],
      ...overrides,
    },
  };
}

describe("collection screen view contract", () => {
  it("renders the TOON summary, forms, lines, and payout guard", () => {
    render(<CollectionForms model={model()} actions={actions} />);

    expect(screen.getByTestId("collection_summary")).toHaveTextContent("3 de 4 socias han aportado");
    expect(screen.getByTestId("collection_summary")).toHaveTextContent("Regularizado");
    expect(screen.getByTestId("collection_summary")).toHaveTextContent("Pendiente");
    expect(screen.getByTestId("form_open_collection")).toBeInTheDocument();
    expect(screen.getByTestId("form_add_line")).toBeInTheDocument();
    expect(screen.getByTestId("lines_table")).toBeInTheDocument();
    expect(screen.getByTestId("form_payout")).toBeInTheDocument();
    expect(screen.getByTestId("payout_guard")).toHaveTextContent("regularizar");
    expect(screen.getByRole("button", { name: "Registrar pago y cerrar colecta" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Regularizar" })).toHaveAttribute(
      "href",
      "/movimientos/registrar?regularizesKind=extraordinary_collection&regularizesId=50000000-0000-4000-8000-000000000001",
    );
  });

  it.each(["closed", "cancelled"] as const)("removes mutation controls for %s collections", (status) => {
    render(<CollectionForms model={model({ status })} actions={actions} />);
    expect(screen.queryByTestId("form_add_line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form_payout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form_cancel_collection")).not.toBeInTheDocument();
  });

  it("renders explicit zero-surplus closure", () => {
    render(<CollectionForms model={model({ status: "closed", surplusAmount: "0.0000" })} actions={actions} />);
    expect(screen.getByTestId("collection_summary")).toHaveTextContent("Sin sobrante");
  });

  it.each([
    ["returned", "Devuelto"],
    ["retained", "Retenido"],
  ] as const)("renders %s surplus disposition", (disposition, label) => {
    render(<CollectionForms model={model({ status: "closed", surplusAmount: "5.0000", disposition })} actions={actions} />);
    expect(screen.getByTestId("collection_summary")).toHaveTextContent(label);
  });

  it("shows the governed recognition close instead of solidarity payout", () => {
    render(<CollectionForms model={model({
      kind: "treasurer_recognition",
      progress: { contributors: 3, activeMembers: 4, collected: "30.0000", regularized: "30.0000", pending: "0.0000" },
    })} actions={actions} />);
    expect(screen.getByTestId("form_close_recognition")).toBeInTheDocument();
    expect(screen.queryByTestId("form_payout")).not.toBeInTheDocument();
  });

  it("defaults recognition to the current fiscal year only when that kind is selected", () => {
    render(<CollectionForms model={model()} actions={actions} />);
    expect(screen.queryByLabelText("Año fiscal del reconocimiento")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "treasurer_recognition" } });
    expect(screen.getByLabelText("Año fiscal del reconocimiento")).toHaveValue(2026);
  });

  it("does not expose payout before the first contribution advances the collection", () => {
    render(<CollectionForms model={model({ status: "open", lines: [], progress: { contributors: 0, activeMembers: 4, collected: "0.0000", regularized: "0.0000", pending: "0.0000" } })} actions={actions} />);
    expect(screen.getByTestId("form_add_line")).toBeInTheDocument();
    expect(screen.queryByTestId("form_payout")).not.toBeInTheDocument();
    expect(screen.getByTestId("form_cancel_collection")).toBeInTheDocument();
  });

  it("uses exact four-decimal arithmetic for the payout ceiling", () => {
    expect(exceedsMoney4Ceiling("20.0000", "20.0000")).toBe(false);
    expect(exceedsMoney4Ceiling("20.0001", "20.0000")).toBe(true);
    expect(exceedsMoney4Ceiling("19.99999", "20.0000")).toBe(false);
    expect(exceedsMoney4Ceiling("9007199254740993.0001", "9007199254740993.0000")).toBe(true);
  });

  it("assigns distinct request IDs per line and command for independent retries", () => {
    const value = model();
    const secondId = "50000000-0000-4000-8000-000000000002";
    value.selected!.lines.push({ ...value.selected!.lines[0], id: secondId, memberName: "Ana Mora" });
    value.lineRequestIds[secondId] = {
      reverse: "10000000-0000-4000-8000-000000000005",
      regularize: "10000000-0000-4000-8000-000000000006",
    };
    const { container } = render(<CollectionForms model={value} actions={actions} />);
    const ids = (command: "reverse" | "regularize") => [...container.querySelectorAll<HTMLFormElement>(`form[data-command="${command}"]`)]
      .map((formElement) => (formElement.querySelector('input[name="clientRequestId"]') as HTMLInputElement).value);
    const reverseIds = ids("reverse");
    const regularizeIds = ids("regularize");
    expect(new Set(reverseIds).size).toBe(2);
    expect(new Set(regularizeIds).size).toBe(2);
    expect(reverseIds[0]).not.toBe(regularizeIds[0]);
    expect(reverseIds[1]).not.toBe(regularizeIds[1]);
  });

  it("prevents a payout above the displayed regularized ceiling", () => {
    render(<CollectionForms model={model({ progress: { contributors: 3, activeMembers: 4, collected: "20.0000", regularized: "20.0000", pending: "0.0000" } })} actions={actions} />);
    const amount = screen.getByLabelText("Monto a pagar (USD)");
    const submit = screen.getByRole("button", { name: "Registrar pago y cerrar colecta" });
    expect(amount).toHaveAttribute("max", "20.0000");
    fireEvent.input(amount, { target: { value: "20.0001" } });
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(submit).toBeDisabled();
    fireEvent.input(amount, { target: { value: "20.0000" } });
    expect(submit).toBeEnabled();
  });
});

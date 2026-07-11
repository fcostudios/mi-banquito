import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MovementForms, ecuadorTodayISO } from "./movement-forms";

const expenseAction = async () => undefined;
const transferAction = async () => undefined;
const componentSource = readFileSync(
  resolve(process.cwd(), "src/app/(authenticated)/movimientos/registrar/movement-forms.tsx"),
  "utf8",
);

const accounts = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Banco principal", last4: "4821", balance: "60.0000" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Caja chica", last4: null, balance: "30.0000" },
];

function renderForms(search: Record<string, string> = {}, rows = accounts) {
  return render(<MovementForms
    accounts={rows}
    search={search}
    expenseAction={expenseAction}
    transferAction={transferAction}
    expenseClientRequestId="33333333-3333-4333-8333-333333333333"
    transferClientRequestId="44444444-4444-4444-8444-444444444444"
    today="2026-07-11"
  />);
}

describe("SCR-record-movement", () => {
  it("keeps the browser-safe rendering module free of runtime domain imports", () => {
    const runtimeDomainImports = componentSource.split("\n").filter((line) =>
      line.includes('from "@mi-banquito/domain"') && !line.trimStart().startsWith("import type"));
    expect(runtimeDomainImports).toEqual([]);
  });

  it("derives today in Ecuador rather than from the UTC calendar date", () => {
    expect(ecuadorTodayISO(new Date("2026-07-12T03:30:00.000Z"))).toBe("2026-07-11");
  });

  it("renders separate accessible expense and transfer forms with group account options", () => {
    const { container } = renderForms();

    expect(screen.getByRole("heading", { name: "Registrar movimiento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Salida del fondo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Movimiento entre cuentas" })).toBeInTheDocument();
    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(2);
    const expenseForm = forms[0] as HTMLFormElement;
    const transferForm = forms[1] as HTMLFormElement;
    expect(within(expenseForm).getByRole("combobox", { name: "Cuenta de donde sale" })).toHaveValue(accounts[0]?.id);
    expect(within(expenseForm).getByRole("textbox", { name: "Monto (USD)" })).toHaveAttribute("inputmode", "decimal");
    expect(within(expenseForm).getByLabelText("Fecha")).toHaveValue("2026-07-11");
    expect(within(expenseForm).getByLabelText("Foto de comprobante (opcional)")).toHaveAttribute("type", "file");
    expect(within(expenseForm).getByRole("textbox", { name: "Notas (opcional)" })).toBeInTheDocument();
    expect(within(expenseForm).getByRole("button", { name: "Guardar salida" })).toBeEnabled();
    expect(within(transferForm).getByRole("combobox", { name: "Desde la cuenta" })).toHaveValue(accounts[0]?.id);
    expect(within(transferForm).getByRole("combobox", { name: "Hacia la cuenta" })).toHaveValue(accounts[1]?.id);
    expect(within(transferForm).getByRole("button", { name: "Guardar transferencia" })).toBeEnabled();
    expect(within(expenseForm).getAllByRole("option", { name: /Banco principal/ })).toHaveLength(1);
    expect(within(expenseForm).getAllByRole("option", { name: "Caja chica" })).toHaveLength(1);
    expect(within(transferForm).getAllByRole("option", { name: /Banco principal/ })).toHaveLength(2);
    expect(within(transferForm).getAllByRole("option", { name: "Caja chica" })).toHaveLength(2);
  });

  it("wires every BR-13 category option", () => {
    renderForms();
    const category = screen.getByRole("combobox", { name: "Categoría" });
    expect(within(category).getAllByRole("option").map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent,
    }))).toEqual([
      { value: "bank_fee", label: "Comisión bancaria" },
      { value: "supplies", label: "Insumos (tintas, papel)" },
      { value: "shared_expense", label: "Gasto compartido (desayunos)" },
      { value: "operating", label: "Operativo" },
      { value: "solidarity_payout", label: "Pago solidario (colecta)" },
      { value: "treasurer_comp_payout", label: "Pago a tesorera (reconocido)" },
    ]);
  });

  it("surfaces the derived balance of every active group account", () => {
    renderForms();

    const balances = screen.getByRole("region", { name: "Saldos por cuenta" });
    expect(within(balances).getByText("Banco principal")).toBeInTheDocument();
    expect(within(balances).getByText("USD 60.0000")).toBeInTheDocument();
    expect(within(balances).getByText("Caja chica")).toBeInTheDocument();
    expect(within(balances).getByText("USD 30.0000")).toBeInTheDocument();
  });

  it("shows only allowlisted inline success state with fixed movement copy", () => {
    renderForms({ saved: "expense", category: "supplies", currency: "USD", amount: "10.5000" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Movimiento registrado — Insumos (tintas, papel), USD 10.5000",
    );
    expect(screen.getByRole("status")).toHaveClass("border-success", "bg-surface", "text-text-primary");
  });

  it("ignores arbitrary query text and renders fixed allowlisted failures", () => {
    const { rerender } = renderForms({ saved: "yes", category: "<script>x</script>", amount: "999 hacked" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("<script>x</script>")).not.toBeInTheDocument();

    rerender(<MovementForms
      accounts={accounts}
      search={{ error: "invalid-form" }}
      expenseAction={expenseAction}
      transferAction={transferAction}
      expenseClientRequestId="33333333-3333-4333-8333-333333333333"
      transferClientRequestId="44444444-4444-4444-8444-444444444444"
      today="2026-07-11"
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los datos del movimiento e intenta nuevamente.");
    expect(screen.getByRole("alert")).toHaveClass("border-error-text", "bg-error-bg", "text-text-primary");
  });

  it("blocks the entire recording surface visibly when no active group account exists", () => {
    const { container } = renderForms({}, []);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pueden registrar movimientos");
    expect(screen.getByRole("alert")).toHaveClass("border-warning-text", "bg-warning-bg", "text-text-primary");
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it("uses mobile-safe single-column full-width form semantics", () => {
    const { container } = renderForms();
    expect(screen.getByRole("main")).toHaveClass("w-full");
    for (const form of container.querySelectorAll("form")) {
      expect(form).toHaveClass("grid", "grid-cols-1", "w-full");
    }
    expect(componentSource).not.toMatch(/w-\[(?:[4-9]\d\d|\d{4,})px\]/);
  });
});

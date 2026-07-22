import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MovementForms, ecuadorTodayISO } from "./movement-forms";

const authSession = vi.hoisted(() => ({
  userId: "auth0|movement-page-fiscal-boundary",
  actorId: "77777777-7777-4777-8777-777777777777",
  orgId: "",
}));

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    async getSession() {
      return {
        user: {
          sub: authSession.userId,
          org_id: authSession.orgId,
          roles: ["TESORERA"],
          email: "movement-page@example.test",
          email_verified: true,
        },
      };
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const expenseAction = async () => undefined;
const transferAction = async () => undefined;
const regularizationAction = async () => undefined;
const compensationAction = async () => undefined;
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
    regularizationAction={regularizationAction}
    compensationAction={compensationAction}
    compensation={{
      cumulativeEntitlement: "55.0000",
      cumulativePaid: "25.0000",
      payableNow: "30.0000",
    }}
    fiscalYear={2026}
    pendingDeposits={[]}
    expenseClientRequestId="33333333-3333-4333-8333-333333333333"
    transferClientRequestId="44444444-4444-4444-8444-444444444444"
    regularizationClientRequestId="55555555-5555-4555-8555-555555555555"
    compensationClientRequestId="66666666-6666-4666-8666-666666666666"
    today="2026-07-11"
  />);
}

describe("SCR-record-movement", () => {
  it("renders the refreshed BR-15 figures and a dedicated enabled payout action", () => {
    const { container } = renderForms();

    const ceiling = screen.getByTestId("treasurer_comp_ceiling");
    expect(ceiling).toHaveTextContent("Reconocido (hasta este año)");
    expect(ceiling).toHaveTextContent("USD 55.00");
    expect(ceiling).toHaveTextContent("Ya pagado (automático + manual)");
    expect(ceiling).toHaveTextContent("USD 25.00");
    expect(ceiling).toHaveTextContent("Disponible ahora");
    expect(ceiling).toHaveTextContent("USD 30.00");
    expect(within(ceiling).getByTestId("cumulative_entitlement")).toHaveTextContent("USD 55.00");
    expect(within(ceiling).getByTestId("cumulative_paid")).toHaveTextContent("USD 25.00");
    expect(within(ceiling).getByTestId("payable_now")).toHaveTextContent("USD 30.00");
    expect(within(ceiling).getByRole("button", { name: "Guardar pago a tesorera" })).toBeEnabled();
    expect(container.querySelector('input[name="fiscalYear"]')).toHaveValue("2026");
  });

  it("uses the updated-artifact Info and ShieldCheck icons as decorative semantics", () => {
    renderForms();
    const helpIcon = screen.getByTestId("help_banner").querySelector(".lucide-info");
    const ceilingIcon = screen.getByTestId("ceiling_note").querySelector(".lucide-shield-check");
    expect(helpIcon).toHaveAttribute("aria-hidden", "true");
    expect(ceilingIcon).toHaveAttribute("aria-hidden", "true");
  });

  it("disables compensation when the shared entitlement is exhausted with exact TOON copy", () => {
    render(<MovementForms
      accounts={accounts}
      search={{}}
      expenseAction={expenseAction}
      transferAction={transferAction}
      regularizationAction={regularizationAction}
      compensationAction={compensationAction}
      compensation={{ cumulativeEntitlement: "25.0000", cumulativePaid: "25.0000", payableNow: "0.0000" }}
      fiscalYear={2026}
      pendingDeposits={[]}
      expenseClientRequestId="33333333-3333-4333-8333-333333333333"
      transferClientRequestId="44444444-4444-4444-8444-444444444444"
      regularizationClientRequestId="55555555-5555-4555-8555-555555555555"
      compensationClientRequestId="66666666-6666-4666-8666-666666666666"
      today="2026-07-11"
    />);

    const ceiling = screen.getByTestId("treasurer_comp_ceiling");
    expect(ceiling).toHaveTextContent("Ya se pagó todo el monto reconocido este año (por el pago automático del sistema o pagos manuales anteriores). No hay disponible.");
    expect(within(ceiling).getByRole("button", { name: "Guardar pago a tesorera" })).toBeDisabled();
  });

  it("renders only allowlisted refreshed figures after a stale-preview ceiling rejection", () => {
    renderForms({
      error: "compensation-ceiling-exceeded",
      cumulativeEntitlement: "55.0000",
      cumulativePaid: "30.0000",
      payableNow: "25.0000",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "El monto supera lo disponible. Reconocido USD 55.00 · ya pagado USD 30.00 · disponible USD 25.00.",
    );
  });
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
    expect(forms).toHaveLength(3);
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
      regularizationAction={regularizationAction}
      compensationAction={compensationAction}
      compensation={{ cumulativeEntitlement: "55.0000", cumulativePaid: "25.0000", payableNow: "30.0000" }}
      fiscalYear={2026}
      pendingDeposits={[]}
      expenseClientRequestId="33333333-3333-4333-8333-333333333333"
      transferClientRequestId="44444444-4444-4444-8444-444444444444"
      regularizationClientRequestId="55555555-5555-4555-8555-555555555555"
      compensationClientRequestId="66666666-6666-4666-8666-666666666666"
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

  it("preselects a pending deposit and fixes its personal source account in regularization mode", () => {
    render(<MovementForms
      accounts={accounts}
      search={{ regularizesKind: "contribution", regularizesId: "66666666-6666-4666-8666-666666666666" }}
      expenseAction={expenseAction}
      transferAction={transferAction}
      regularizationAction={regularizationAction}
      compensationAction={compensationAction}
      compensation={{ cumulativeEntitlement: "55.0000", cumulativePaid: "25.0000", payableNow: "30.0000" }}
      fiscalYear={2026}
      pendingDeposits={[{
        id: "66666666-6666-4666-8666-666666666666",
        sourceKind: "contribution",
        memberName: "Ana",
        accountId: "77777777-7777-4777-8777-777777777777",
        accountName: "Cuenta personal",
        amount: "50.0000",
        remaining: "10.0000",
        datedOn: "2026-07-10",
      }]}
      expenseClientRequestId="33333333-3333-4333-8333-333333333333"
      transferClientRequestId="44444444-4444-4444-8444-444444444444"
      regularizationClientRequestId="55555555-5555-4555-8555-555555555555"
      compensationClientRequestId="66666666-6666-4666-8666-666666666666"
      today="2026-07-11"
    />);

    const section = screen.getByTestId("regularization_group");
    expect(within(section).getByText("Cuenta personal")).toBeInTheDocument();
    expect(within(section).getByRole("combobox", { name: "Hacia la cuenta del fondo" })).toHaveValue(accounts[0]?.id);
    expect(within(section).getByRole("textbox", { name: "Monto (USD)" })).toHaveValue("10.0000");
    expect(within(section).getByRole("checkbox", { name: /Confirmo/ })).toBeRequired();
    expect(within(section).getByRole("button", { name: "Guardar regularización" })).toBeEnabled();
  });

  it("renders a safely encoded next-page link while preserving deep-link selection", () => {
    render(<MovementForms
      accounts={accounts}
      search={{
        regularizesKind: "extraordinary_collection",
        regularizesId: "66666666-6666-4666-8666-666666666666",
        error: "invalid-form",
      }}
      expenseAction={expenseAction}
      transferAction={transferAction}
      regularizationAction={regularizationAction}
      compensationAction={compensationAction}
      compensation={{ cumulativeEntitlement: "55.0000", cumulativePaid: "25.0000", payableNow: "30.0000" }}
      fiscalYear={2026}
      pendingDeposits={[{
        id: "66666666-6666-4666-8666-666666666666",
        sourceKind: "extraordinary_collection",
        memberName: "Ana & Bea",
        accountId: "77777777-7777-4777-8777-777777777777",
        accountName: "Cuenta personal",
        amount: "50.0000",
        remaining: "10.0000",
        datedOn: "2026-07-10",
      }]}
      nextCursor={{
        datedOn: "2026-07-21",
        sourceKind: "extraordinary_collection",
        id: "88888888-8888-4888-8888-888888888888",
      }}
      expenseClientRequestId="33333333-3333-4333-8333-333333333333"
      transferClientRequestId="44444444-4444-4444-8444-444444444444"
      regularizationClientRequestId="55555555-5555-4555-8555-555555555555"
      compensationClientRequestId="66666666-6666-4666-8666-666666666666"
      today="2026-07-11"
    />);

    expect(screen.getByRole("link", { name: "Ver más depósitos pendientes" })).toHaveAttribute(
      "href",
      "/movimientos/registrar?error=invalid-form&regularizesKind=extraordinary_collection&regularizesId=66666666-6666-4666-8666-666666666666&pendingDate=2026-07-21&pendingKind=extraordinary_collection&pendingId=88888888-8888-4888-8888-888888888888",
    );
  });
});

describe("SCR-record-movement page loading with PostgreSQL", () => {
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
  let orgId: string;
  let userAccountId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for movement page integration tests");
    const { randomUUID } = await import("node:crypto");
    const schema = await import("@mi-banquito/db/schema");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    orgId = randomUUID();
    authSession.orgId = orgId;
    await db.insert(schema.organization).values({
      id: orgId,
      displayName: "Movement page fiscal boundary",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: authSession.actorId,
      createdByKind: "system",
    });
    await db.insert(schema.member).values({
      id: authSession.actorId,
      orgId,
      displayName: "Tesorera página",
      joinedOn: "2025-01-01",
      role: "tesorera",
      status: "activo",
      initialSavingsBalance: "0.0000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: authSession.actorId,
      createdByKind: "member",
    });
    await db.insert(schema.groupConfig).values({
      orgId,
      version: 1,
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
      validTo: null,
      contributionCycleKind: "monthly",
      contributionAmount: "20.0000",
      currencyCode: "USD",
      loanRateModel: "declining_balance",
      loanRateValue: "1.0000",
      loanRatePeriodUnit: "monthly",
      loanGracePeriods: 0,
      loanToSavingsCapRatio: "3.00",
      interestResolution: "daily",
      repaymentSplitRule: "interest_first",
      paysSavingsInterest: false,
      savingsInterestRate: null,
      yearEndShareOutFormula: "time_weighted",
      safetyMarginAmount: "0.0000",
      reconciliationToleranceAmount: "0.0000",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: 7,
      fiscalYearStartDay: 15,
      config: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: authSession.actorId,
      createdByKind: "member",
    });
    await db.insert(schema.account).values({
      orgId,
      name: "Banco página",
      type: "group_bank",
      isGroupFund: true,
      status: "active",
      clientRequestId: randomUUID(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: authSession.actorId,
    });
    const [identity] = await db.insert(schema.userAccount).values({
      authSubject: authSession.userId,
      email: "movement-page@example.test",
      displayName: "Tesorera página",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: null,
    }).returning();
    if (!identity) throw new Error("movement_page_identity_not_created");
    userAccountId = identity.id;
    await db.insert(schema.userOrgMembership).values({
      userId: identity.id,
      orgId,
      role: "TESORERA",
      status: "active",
      memberId: authSession.actorId,
      grantedAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: null,
    });
    await db.insert(schema.treasurerCompensationDisbursement).values({
      orgId,
      memberId: authSession.actorId,
      periodLabel: "2026-07",
      amount: "20.0000",
      currencyCode: "USD",
      kindAtDisbursement: { kind: "fixed_periodic", nextDueOn: "2026-07-15", period: "monthly" },
      withdrawalId: null,
      disbursedOn: "2026-07-15",
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    const schema = await import("@mi-banquito/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    await withTenantTransaction(orgId, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(schema.treasurerCompensationDisbursement).where(eq(schema.treasurerCompensationDisbursement.orgId, orgId));
      await tx.delete(schema.userOrgMembership).where(eq(schema.userOrgMembership.orgId, orgId));
      await tx.delete(schema.account).where(eq(schema.account.orgId, orgId));
      await tx.delete(schema.groupConfig).where(eq(schema.groupConfig.orgId, orgId));
      await tx.delete(schema.member).where(eq(schema.member.orgId, orgId));
    });
    await db.delete(schema.userAccount).where(eq(schema.userAccount.id, userAccountId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    vi.useRealTimers();
  });

  it("honors a supplied fiscal year and loads its real compensation breakdown", async () => {
    const Page = (await import("./page")).default;
    const view = await Page({ searchParams: Promise.resolve({ fiscalYear: "2026" }) });
    render(view);
    const ceiling = screen.getByTestId("treasurer_comp_ceiling");
    expect(ceiling).toHaveTextContent("Año fiscal 2026");
    expect(within(ceiling).getByTestId("cumulative_entitlement")).toHaveTextContent("USD 20.00");
  });

  it("derives the current org fiscal year before a non-January boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T16:00:00.000Z"));
    const Page = (await import("./page")).default;
    const view = await Page({ searchParams: Promise.resolve({}) });
    render(view);
    const ceiling = screen.getByTestId("treasurer_comp_ceiling");
    expect(ceiling).toHaveTextContent("Año fiscal 2025");
    expect(within(ceiling).getByTestId("cumulative_entitlement")).toHaveTextContent("USD 0.00");
    vi.useRealTimers();
  });

  it("moves to the new fiscal year on the configured boundary day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T16:00:00.000Z"));
    const Page = (await import("./page")).default;
    const view = await Page({ searchParams: Promise.resolve({}) });
    render(view);
    const ceiling = screen.getByTestId("treasurer_comp_ceiling");
    expect(ceiling).toHaveTextContent("Año fiscal 2026");
    expect(within(ceiling).getByTestId("cumulative_entitlement")).toHaveTextContent("USD 20.00");
    vi.useRealTimers();
  });
});

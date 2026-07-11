import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountsRegistry } from "./accounts-registry";

const saveAction = async () => undefined;
const archiveAction = async () => undefined;
const saveClientRequestId = "33333333-3333-4333-8333-333333333333";
const registrySource = readFileSync(
  resolve(process.cwd(), "src/app/(authenticated)/cuentas/accounts-registry.tsx"),
  "utf8",
);

const accounts = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Banco principal",
    type: "group_bank" as const,
    isGroupFund: true,
    last4: "4821",
    productType: null,
    institutionId: null,
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    status: "archived" as const,
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    createdBy: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Cuenta personal de Ana",
    type: "treasurer_personal" as const,
    isGroupFund: false,
    last4: "7733",
    productType: null,
    institutionId: null,
    clientRequestId: "55555555-5555-4555-8555-555555555555",
    status: "active" as const,
    createdAt: new Date("2026-07-11T12:00:00.000Z"),
    createdBy: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
];

describe("AccountsRegistry", () => {
  it("keeps the client module free of runtime domain imports", () => {
    const runtimeDomainImports = registrySource.split("\n").filter((line) =>
      line.includes('from "@mi-banquito/domain"') && !line.trimStart().startsWith("import type"));
    expect(runtimeDomainImports).toEqual([]);
  });

  function renderRegistry(search: Record<string, string> = {}) {
    return render(<AccountsRegistry
      accounts={accounts}
      search={search}
      saveAction={saveAction}
      archiveAction={archiveAction}
      saveClientRequestId={saveClientRequestId}
    />);
  }

  it("renders the list, account form, fund labels, archive control, retained archive, and movement block", () => {
    const { container } = renderRegistry();

    expect(screen.getByRole("heading", { name: "Cuentas del grupo" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Cuentas registradas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nombre de la cuenta" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tipo de cuenta" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Terminación (4 dígitos, opcional)" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "¿Esta cuenta es parte del fondo del grupo?" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Según el tipo de cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Dentro del fondo")).toHaveClass("status-pill--success");
    expect(screen.getByText("Fuera del fondo - requiere regularización")).toHaveClass("status-pill--error-text");
    expect(screen.getByText("Archivada")).toHaveClass("status-pill--info-text");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pueden registrar movimientos");
    expect(screen.getByTestId("movement_blocked_banner")).toHaveClass(
      "border-warning-text",
      "bg-warning-bg",
      "text-text-primary",
    );
    expect(screen.getByTestId("fund_note")).toHaveClass("border-info-text", "bg-info-bg", "text-text-primary");

    const activeRow = screen.getByRole("row", { name: /Cuenta personal de Ana/ });
    expect(within(activeRow).getByRole("button", { name: "Archivar Cuenta personal de Ana" })).toHaveClass(
      "bg-error-text",
      "text-surface",
    );
    expect(within(activeRow).getByRole("link", { name: "Editar Cuenta personal de Ana" })).toHaveAttribute(
      "href",
      "/cuentas?edit=22222222-2222-4222-8222-222222222222#form_account",
    );
    const archivedRow = screen.getByRole("row", { name: /Banco principal/ });
    expect(within(archivedRow).queryByRole("button", { name: /Archivar/ })).not.toBeInTheDocument();
    expect(container.querySelector('input[name="clientRequestId"]')).toHaveValue(saveClientRequestId);
  });

  it("opens an accessible modal, focuses confirm, and supports Escape and cancel", async () => {
    const { container } = renderRegistry();

    fireEvent.click(screen.getByRole("button", { name: "Archivar Cuenta personal de Ana" }));

    const modal = container.querySelector('[data-molecule="confirmation-modal"]');
    expect(modal).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Archivar Cuenta personal de Ana" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveClass("backdrop:bg-text-primary/50");
    const confirm = within(dialog).getByRole("button", { name: "Confirmar archivo" });
    const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(screen.getByRole("main")).toHaveProperty("inert", true);

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveProperty("inert", false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Archivar Cuenta personal de Ana" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Archivar Cuenta personal de Ana" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores arbitrary feedback query text", () => {
    renderRegistry({ error: "<script>not trusted</script>", saved: "anything", archived: "yes" });

    expect(screen.queryByText("<script>not trusted</script>")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders allowlisted errors with emitted high-contrast token classes", () => {
    renderRegistry({ error: "invalid-form" });

    expect(screen.getByText("Revisa los datos de la cuenta e intenta nuevamente.")).toHaveClass(
      "border-error-text",
      "bg-error-bg",
      "text-text-primary",
    );
  });
});

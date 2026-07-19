import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { Pool } from "pg";

const ACTOR_ID = randomUUID();
const ACCOUNT_IDS = [randomUUID(), randomUUID()] as const;
const ACCOUNT_REQUEST_IDS = [randomUUID(), randomUUID()] as const;

let pool: Pool;
let orgId: string;

async function expectNoAxeViolations(page: Page) {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async (runOnlyTags) => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe;
    return axeApi.run(document, { runOnly: { type: "tag", values: runOnlyTags } });
  }, tags);
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.flatMap((node) => node.target),
  }));

  expect(summary, "axe-core found WCAG A/AA violations").toEqual([]);
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(foreground: number[], background: number[]): number {
  const foregroundLuminance = relativeLuminance(foreground[0] ?? 0, foreground[1] ?? 0, foreground[2] ?? 0);
  const backgroundLuminance = relativeLuminance(background[0] ?? 0, background[1] ?? 0, background[2] ?? 0);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test.beforeAll(async ({}, testInfo) => {
  const configuredOrgId = testInfo.config.metadata.movementOrgId;
  if (typeof configuredOrgId !== "string") throw new Error("movementOrgId metadata is required");
  orgId = configuredOrgId;
  if (!process.env.DATABASE_URL) loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for movement e2e tests");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const now = new Date("2026-07-11T12:00:00.000Z");
  await pool.query(`
    INSERT INTO organization (
      id, display_name, country_code, currency_code, timezone, default_language,
      status, created_at, created_by, created_by_kind
    ) VALUES ($1, $2, 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', $3, $4, 'system')
    ON CONFLICT (id) DO UPDATE SET status = 'active'
  `, [orgId, `Movement viewport test ${orgId.slice(0, 8)}`, now, ACTOR_ID]);
  await pool.query(`
    INSERT INTO account (
      id, org_id, name, type, is_group_fund, last4, client_request_id, status, created_at, created_by
    ) VALUES
      ($1, $3, 'Banco E2E', 'group_bank', true, '1234', $4, 'active', $6, $7),
      ($2, $3, 'Caja E2E', 'cash_box', true, NULL, $5, 'active', $6, $7)
    ON CONFLICT (id) DO UPDATE SET is_group_fund = true, status = 'active'
  `, [
    ACCOUNT_IDS[0],
    ACCOUNT_IDS[1],
    orgId,
    ACCOUNT_REQUEST_IDS[0],
    ACCOUNT_REQUEST_IDS[1],
    now,
    ACTOR_ID,
  ]);
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query("DELETE FROM account WHERE org_id = $1", [orgId]);
    await pool.query("DELETE FROM organization WHERE id = $1", [orgId]);
  } finally {
    await pool.end();
  }
});

test("movement form is readable, accessible, and stable at the configured viewport", async ({ page }) => {
  await page.goto("/movimientos/registrar");
  await expect(page.getByRole("heading", { level: 1, name: "Registrar movimiento" })).toBeVisible();
  await expect(page.getByTestId("salida_group")).toBeVisible();
  await expect(page.getByTestId("transfer_group")).toBeVisible();
  await expect(page.getByTestId("account_balances")).toContainText("Banco E2E");
  await expect(page.getByTestId("account_balances")).toContainText("Caja E2E");
  await expect(page.getByTestId("account_balances")).toContainText("USD");

  const categoryOptions = await page.locator("#expense-category option").allTextContents();
  expect(categoryOptions).toEqual([
    "Comisión bancaria",
    "Insumos (tintas, papel)",
    "Gasto compartido (desayunos)",
    "Operativo",
    "Pago solidario (colecta)",
    "Pago a tesorera (reconocido)",
  ]);

  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button",
    )].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const rectangles = controls.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id || element.textContent?.trim() || element.tagName, top: rect.top, left: rect.left,
        right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const overlaps: string[] = [];
    for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
        const left = rectangles[leftIndex];
        const right = rectangles[rightIndex];
        if (!left || !right) continue;
        if (Math.min(left.right, right.right) > Math.max(left.left, right.left)
          && Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top)) {
          overlaps.push(`${left.id}:${right.id}`);
        }
      }
    }
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      rectangles,
      overlaps,
      labels: controls.filter((element) => element.id && element.tagName !== "BUTTON")
        .map((element) => ({ id: element.id, hasLabel: Boolean(document.querySelector(`label[for="${element.id}"]`)) })),
      colors: controls.map((element) => {
        const style = getComputedStyle(element);
        const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return { id: element.id || element.textContent?.trim() || element.tagName,
          foreground: parse(style.color), background: parse(style.backgroundColor) };
      }),
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.overlaps).toEqual([]);
  expect(layout.rectangles.length).toBeGreaterThanOrEqual(12);
  expect(layout.rectangles.every((rect) => rect.width > 0 && rect.height >= 44)).toBe(true);
  expect(layout.rectangles.every((rect) => rect.left >= 0 && rect.right <= layout.viewportWidth + 1)).toBe(true);
  expect(layout.labels.every((label) => label.hasLabel)).toBe(true);
  for (const color of layout.colors) {
    expect(contrastRatio(color.foreground, color.background), color.id).toBeGreaterThanOrEqual(4.5);
  }

  await expectNoAxeViolations(page);
});

test("accounts screen has no axe WCAG A/AA violations", async ({ page }) => {
  await page.goto("/cuentas");
  await expect(page.getByRole("heading", { level: 1, name: "Cuentas" })).toBeVisible();
  await expect(page.getByText("Banco E2E")).toBeVisible();

  await expectNoAxeViolations(page);
});

test("group rules are read-only until the treasurer chooses Editar reglas", async ({ page }) => {
  await page.goto("/grupo");

  const editRules = page.getByRole("link", { name: "Editar reglas" });
  await expect(editRules).toBeVisible();
  await expect(page.locator('fieldset[name="group-rules"]')).toHaveAttribute("disabled", "");
  await expect(page.locator('input[name="contributionAmount"]')).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);

  await editRules.click();
  await expect(page).toHaveURL(/\/grupo\?editar=1$/);
  await expect(page.locator('fieldset[name="group-rules"]')).not.toHaveAttribute("disabled", "");
  await expect(page.locator('input[name="contributionAmount"]')).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
});

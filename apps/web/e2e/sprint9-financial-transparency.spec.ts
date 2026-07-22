import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const ROSA_ID = randomUUID();
const MARIA_ID = randomUUID();
const PERSONAL_ACCOUNT_ID = randomUUID();
const GROUP_ACCOUNT_ID = randomUUID();
const CYCLE_ID = randomUUID();
const RECONCILIATION_ID = randomUUID();
const PERIOD_CLOSE_ID = randomUUID();
const MONTHLY_CLOSE_ARCHIVE_ID = randomUUID();
const CRON_WITHDRAWAL_ID = randomUUID();
const RECOGNITION_COLLECTION_ID = randomUUID();
const RECOGNITION_LINE_ID = randomUUID();
const FOREIGN_ORG_ID = randomUUID();
const FOREIGN_ACCOUNT_ID = randomUUID();
const FOREIGN_EXPENSE_ID = randomUUID();
const FOREIGN_SENTINEL = `FOREIGN_SENTINEL_${randomUUID()}`;
const NOW = new Date("2026-07-22T12:00:00.000Z");

let pool: Pool;
let orgId: string;
let actorId: string;
let nonTreasurerActorId: string;

type ArchivedMovement = {
  sourceKind: string;
  sourceId: string;
  datedOn: string;
  label: string;
  category: string;
  accountName: string | null;
  reconciliationStatus: string | null;
  signedAmount: string;
};

async function clearFixture() {
  const tables = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
      AND table_name NOT LIKE 'mv_%'
    ORDER BY table_name
  `);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const { table_name: tableName } of tables.rows) {
      if (!/^[a-z0-9_]+$/.test(tableName)) throw new Error("unsafe fixture table name");
      await client.query(`DELETE FROM "${tableName}" WHERE org_id = $1`, [orgId]);
    }
    await client.query("DELETE FROM organization WHERE id = $1", [orgId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function clearForeignSentinel() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("DELETE FROM expense WHERE org_id = $1", [FOREIGN_ORG_ID]);
    await client.query("DELETE FROM account WHERE org_id = $1", [FOREIGN_ORG_ID]);
    await client.query("DELETE FROM organization WHERE id = $1", [FOREIGN_ORG_ID]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedFixture() {
  await pool.query(`
    INSERT INTO organization (
      id, display_name, country_code, currency_code, timezone, default_language,
      status, created_at, created_by, created_by_kind
    ) VALUES ($1, 'Banquito Transparencia E2E', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
      'active', $2, $3, 'system')
  `, [orgId, NOW, actorId]);
  await pool.query(`
    INSERT INTO member (
      id, org_id, display_name, whatsapp_number, joined_on, role, status,
      initial_savings_balance, created_at, created_by, created_by_kind
    ) VALUES
      ($1, $4, 'Tesorera E2E', '+593990000001', '2025-01-01', 'tesorera', 'activo', 0, $5, $1, 'member'),
      ($2, $4, 'Rosa Tituaña', '+593990000002', '2025-01-01', 'aportante', 'activo', 0, $5, $1, 'member'),
      ($3, $4, 'María Quishpe', '+593990000003', '2025-01-01', 'aportante', 'activo', 0, $5, $1, 'member'),
      ($6, $4, 'Aportante sin tesorería', '+593990000004', '2025-01-01', 'aportante', 'activo', 0, $5, $1, 'member')
  `, [actorId, ROSA_ID, MARIA_ID, orgId, NOW, nonTreasurerActorId]);
  await pool.query(`
    INSERT INTO account (id, org_id, name, type, is_group_fund, last4, client_request_id, status, created_at, created_by)
    VALUES
      ($1, $3, 'Cuenta personal de la tesorera', 'treasurer_personal', false, '9001', $4, 'active', $6, $7),
      ($2, $3, 'Banco del grupo', 'group_bank', true, '4242', $5, 'active', $6, $7)
  `, [PERSONAL_ACCOUNT_ID, GROUP_ACCOUNT_ID, orgId, randomUUID(), randomUUID(), NOW, actorId]);
  await pool.query(`
    INSERT INTO group_config (
      org_id, version, valid_from, valid_to, contribution_cycle_kind, contribution_amount,
      currency_code, loan_rate_model, loan_rate_value, loan_rate_period_unit, loan_grace_periods,
      loan_to_savings_cap_ratio, interest_resolution, repayment_split_rule, pays_savings_interest,
      savings_interest_rate, year_end_share_out_formula, safety_margin_amount,
      reconciliation_tolerance_amount, late_threshold_days, mora_threshold_days,
      fiscal_year_start_month, fiscal_year_start_day, config, created_at, created_by, created_by_kind
    ) VALUES ($1, 1, '2025-01-01', NULL, 'monthly', 20, 'USD', 'declining_balance', 1,
      'monthly', 0, 3, 'daily', 'interest_first', false, NULL, 'time_weighted', 0, 0, 1, 5,
      1, 1, '{}'::jsonb, $2, $3, 'member')
  `, [orgId, NOW, actorId]);
  await pool.query(`
    INSERT INTO contribution_cycle (
      id, org_id, cycle_label, kind, opens_on, closes_on, expected_amount_per_member,
      currency_code, status, created_at, created_by, created_by_kind
    ) VALUES ($1, $2, '2026-07', 'monthly', '2026-07-01', '2026-07-31', 20, 'USD', 'closed', $3, $4, 'system')
  `, [CYCLE_ID, orgId, NOW, actorId]);
  await pool.query(`
    INSERT INTO contribution (
      id, org_id, cycle_id, member_id, amount, currency_code, dated_on, recorded_at,
      account_id, reconciliation_status, client_request_id, created_at, created_by, created_by_kind
    ) VALUES ($1, $2, $3, $4, 100, 'USD', '2026-07-05', $5, $6, 'regularized', $7, $5, $8, 'member')
  `, [randomUUID(), orgId, CYCLE_ID, MARIA_ID, NOW, GROUP_ACCOUNT_ID, randomUUID(), actorId]);
  await pool.query(`
    INSERT INTO reconciliation_cycle (
      id, org_id, cycle_id, declared_bank_balance, computed_pool_balance, discrepancy_amount,
      tolerance_amount, resolution_kind, closed_at, created_at, created_by, created_by_kind
    ) VALUES ($1, $2, $3, 100, 100, 0, 0, 'auto_within_tolerance', $4, $4, $5, 'system')
  `, [RECONCILIATION_ID, orgId, CYCLE_ID, NOW, actorId]);
  await pool.query(`
    INSERT INTO withdrawal (
      id, org_id, member_id, amount, currency_code, dated_on, recorded_at, kind,
      client_request_id, created_at, created_by, created_by_kind
    ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-10', $4, 'treasurer_compensation_disbursement', $5, $4, $3, 'system')
  `, [CRON_WITHDRAWAL_ID, orgId, actorId, NOW, randomUUID()]);
  await pool.query(`
    INSERT INTO treasurer_compensation_disbursement (
      id, org_id, member_id, period_label, amount, currency_code, kind_at_disbursement,
      withdrawal_id, disbursed_on, created_at
    ) VALUES ($1, $2, $3, '2026-07', 20, 'USD',
      '{"kind":"fixed_periodic","nextDueOn":"2026-07-10","period":"monthly"}'::jsonb,
      $4, '2026-07-10', $5)
  `, [randomUUID(), orgId, actorId, CRON_WITHDRAWAL_ID, NOW]);
  await pool.query(`
    INSERT INTO extraordinary_collection (
      id, org_id, kind, purpose, beneficiary_member_id, status, opened_on,
      recognition_fiscal_year, created_at, created_by
    ) VALUES ($1, $2, 'treasurer_recognition', 'Reconocimiento 2026 E2E', $3,
      'collecting', '2026-07-01', 2026, $4, $3)
  `, [RECOGNITION_COLLECTION_ID, orgId, actorId, NOW]);
  await pool.query(`
    INSERT INTO extraordinary_collection_line (
      id, org_id, collection_id, member_id, amount, account_id,
      reconciliation_status, dated_on, created_at, created_by
    ) VALUES ($1, $2, $3, $4, 35, $5, 'regularized', '2026-07-02', $6, $4)
  `, [RECOGNITION_LINE_ID, orgId, RECOGNITION_COLLECTION_ID, actorId, GROUP_ACCOUNT_ID, NOW]);
  await pool.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [RECOGNITION_COLLECTION_ID]);
  await pool.query(`
    UPDATE extraordinary_collection
    SET status = 'closed', surplus_amount = 35, disposition = 'retained',
        disposition_motive = 'Acta reconocimiento E2E'
    WHERE id = $1
  `, [RECOGNITION_COLLECTION_ID]);
  await pool.query(`
    INSERT INTO organization (
      id, display_name, country_code, currency_code, timezone, default_language,
      status, created_at, created_by, created_by_kind
    ) VALUES ($1, 'Organización Centinela E2E', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
      'active', $2, $3, 'system')
  `, [FOREIGN_ORG_ID, NOW, actorId]);
  await pool.query(`
    INSERT INTO account (
      id, org_id, name, type, is_group_fund, last4, client_request_id,
      status, created_at, created_by
    ) VALUES ($1, $2, 'Cuenta centinela extranjera', 'group_bank', true, '9999', $3,
      'active', $4, $5)
  `, [FOREIGN_ACCOUNT_ID, FOREIGN_ORG_ID, randomUUID(), NOW, actorId]);
  await pool.query(`
    INSERT INTO expense (
      id, org_id, purpose, amount, currency_code, beneficiary_text, incurred_on,
      status, recorded_at, account_id, category, client_request_id, created_at,
      created_by, created_by_kind
    ) VALUES ($1, $2, $3, 999, 'USD', 'Extranjera', '2026-07-22', 'paid', $4,
      $5, 'operating', $6, $4, $7, 'system')
  `, [FOREIGN_EXPENSE_ID, FOREIGN_ORG_ID, FOREIGN_SENTINEL, NOW, FOREIGN_ACCOUNT_ID, randomUUID(), actorId]);
}

async function closeFixturePeriod() {
  await pool.query(`
    INSERT INTO period_close (
      id, org_id, cycle_id, reconciliation_cycle_id, closed_at, closed_by,
      closed_by_kind, is_year_end, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'member', false, $5)
  `, [PERIOD_CLOSE_ID, orgId, CYCLE_ID, RECONCILIATION_ID, NOW, actorId]);
  await pool.query(`
    INSERT INTO statement_archive (
      id, org_id, kind, member_id, period_label, pdf_uri, canonical_payload_hash,
      canonical_payload, generated_at, period_close_id, byte_size, created_at, created_by_kind
    ) VALUES ($1, $2, 'monthly_close', NULL, '2026-07', $3, $4, '{}'::jsonb, $5, $6, 1, $5, 'system')
  `, [MONTHLY_CLOSE_ARCHIVE_ID, orgId, `/statement-archive/public/${"a".repeat(64)}.pdf`, "a".repeat(64), NOW, PERIOD_CLOSE_ID]);
}

async function expectMeaningfulIcons(page: Page) {
  const expected = [
    ["Inicio", "lucide-house"],
    ["Socias", "lucide-users"],
    ["Aportes", "lucide-wallet"],
    ["Cuota base", "lucide-banknote"],
    ["Préstamos", "lucide-hand-coins"],
  ] as const;
  for (const [label, iconClass] of expected) {
    const link = page.getByRole("link", { name: label }).last();
    await expect(link).toBeVisible();
    await expect(link.locator("svg")).toHaveClass(new RegExp(`\\b${iconClass}\\b`));
    await expect(link.locator("svg")).not.toHaveClass(/\blucide-circle\b/);
  }
}

test.beforeAll(async ({}, testInfo) => {
  const configuredOrgId = testInfo.config.metadata.sprint9OrgId;
  const configuredActorId = testInfo.config.metadata.sprint9ActorId;
  const configuredNonTreasurerActorId = testInfo.config.metadata.sprint9NonTreasurerActorId;
  if (typeof configuredOrgId !== "string" || typeof configuredActorId !== "string"
    || typeof configuredNonTreasurerActorId !== "string") {
    throw new Error("Sprint 9 fixture metadata is required");
  }
  orgId = configuredOrgId;
  actorId = configuredActorId;
  nonTreasurerActorId = configuredNonTreasurerActorId;
  if (!process.env.DATABASE_URL) loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Sprint 9 E2E");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await clearFixture();
  await clearForeignSentinel();
  await seedFixture();
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await clearFixture();
    const sentinel = await pool.query<{ purpose: string; amount: string }>(`
      SELECT purpose, amount FROM expense WHERE org_id = $1 AND id = $2
    `, [FOREIGN_ORG_ID, FOREIGN_EXPENSE_ID]);
    expect(sentinel.rows).toEqual([{ purpose: FOREIGN_SENTINEL, amount: "999.0000" }]);
  } finally {
    await clearForeignSentinel();
    await pool.end();
  }
});

test("collect, regularize, pay, compensate, archive, and publicly verify", async ({ page, request }) => {
  const treasurerHeaders = {
    "x-e2e-auth-actor-id": actorId,
    "x-e2e-auth-roles": "TESORERA",
  };
  await page.context().setExtraHTTPHeaders(treasurerHeaders);
  await page.goto("/colectas");
  await expect(page.getByRole("heading", { level: 1, name: "Colecta solidaria" })).toBeVisible();
  await expectMeaningfulIcons(page);

  await page.getByLabel("Motivo de la colecta").fill("Calamidad doméstica E2E");
  await page.getByLabel("Beneficiaria").selectOption({ label: "Rosa Tituaña" });
  await page.getByRole("button", { name: "Abrir colecta" }).click();
  await expect(page).toHaveURL(/collectionId=/);
  await page.getByLabel("Socia").selectOption({ label: "María Quishpe" });
  await page.getByLabel("Monto (USD)").fill("30.00");
  await page.getByLabel("¿En qué cuenta entró?").selectOption({ label: "Cuenta personal de la tesorera" });
  await page.getByRole("button", { name: "Agregar aporte" }).click();

  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(page.getByTestId("payout_guard")).toContainText("Primero debes regularizar");
  await expect(page.getByTestId("btn_payout")).toBeDisabled();
  await page.getByLabel("Hacia la cuenta").selectOption({ label: "Banco del grupo" });
  await page.getByText("Confirmo que el dinero ya está en la cuenta del grupo").click();
  await page.getByRole("button", { name: "Confirmar regularización" }).click();
  await expect(page.getByText("Regularizado", { exact: true })).toBeVisible();
  await expect(page.getByTestId("btn_payout")).toBeEnabled();

  await page.getByLabel("Monto a pagar (USD)").fill("25.00");
  const payoutForm = page.getByTestId("form_payout");
  await payoutForm.getByLabel("Si sobra dinero").selectOption("retained");
  await page.getByRole("button", { name: "Registrar pago y cerrar colecta" }).click();
  await expect(page.getByText("Escribe la referencia de la votación del grupo.", { exact: true })).toBeVisible();
  const validPayoutForm = page.getByTestId("form_payout");
  await validPayoutForm.getByLabel("Monto a pagar (USD)").fill("25.00");
  await validPayoutForm.getByLabel("Si sobra dinero").selectOption("retained");
  await validPayoutForm.getByLabel("Referencia de la votación").fill("Acta julio 2026");
  await page.getByRole("button", { name: "Registrar pago y cerrar colecta" }).click();
  await expect(page.getByText("Colecta cerrada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("form_payout")).toHaveCount(0);
  await expect(page.getByTestId("form_cancel_collection")).toHaveCount(0);

  await page.goto("/movimientos/registrar?fiscalYear=2026");
  await expect(page.getByTestId("cumulative_entitlement")).toContainText("USD 35.00");
  await expect(page.getByTestId("cumulative_paid")).toContainText("USD 10.00");
  await expect(page.getByTestId("payable_now")).toContainText("USD 25.00");
  await page.getByLabel("Monto (USD)").last().fill("25.01");
  await page.getByLabel("Cuenta de donde sale").last().selectOption(GROUP_ACCOUNT_ID);
  await page.getByRole("button", { name: "Guardar pago a tesorera" }).click();
  await expect(page.getByText(/El monto supera lo disponible/)).toBeVisible();
  await expect(page.getByText(/disponible USD 25\.00/)).toBeVisible();
  await page.getByLabel("Monto (USD)").last().fill("25.00");
  await page.getByRole("button", { name: "Guardar pago a tesorera" }).click();
  await expect(page.getByTestId("payable_now")).toContainText("USD 0.00");
  await expect(page.getByText(/Ya se pagó todo el monto reconocido/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar pago a tesorera" })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("cumulative_entitlement")).toContainText("USD 35.00");
  await expect(page.getByTestId("cumulative_paid")).toContainText("USD 35.00");
  await expect(page.getByTestId("payable_now")).toContainText("USD 0.00");
  await expect(page.getByText(/Ya se pagó todo el monto reconocido/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar pago a tesorera" })).toBeDisabled();

  await closeFixturePeriod();
  await page.goto("/estados");
  await expect(page.getByTestId("members")).toHaveText(/Socias con estado3/);
  await expect(page.getByTestId("in")).toHaveText(/Aportes del mesUSD 100\.00/);
  await expect(page.getByTestId("out")).toHaveText(/Préstamos desembolsadosUSD 0\.00/);
  await expect(page.getByTestId("movements")).toHaveText(/Movimientos del fondoUSD 35\.00/);
  await expect(page.getByTestId("saldo")).toHaveText(/Saldo neto del fondoUSD 70\.00/);
  await expect(page.getByText(FOREIGN_SENTINEL)).toHaveCount(0);
  await page.getByRole("button", { name: "Generar estados de cuenta de 2026-07" }).click();
  await expect(page.getByText("4 de 4 estados por socia listos.", { exact: true })).toBeVisible({ timeout: 30_000 });

  const archives = await pool.query<{
    member_id: string; canonical_payload_hash: string; pdf_uri: string; byte_size: number;
    canonical_payload: { verificationMovements: ArchivedMovement[] };
  }>(`
    SELECT member_id, canonical_payload_hash, pdf_uri, byte_size, canonical_payload FROM statement_archive
    WHERE org_id = $1 AND kind = 'monthly_member' AND period_label = '2026-07'
    ORDER BY member_id
  `, [orgId]);
  expect(archives.rows).toHaveLength(4);
  expect(archives.rows.every((row) => row.byte_size > 500 && /^[a-f0-9]{64}$/.test(row.canonical_payload_hash))).toBe(true);
  const mariaArchive = archives.rows.find((row) => row.member_id === MARIA_ID);
  const treasurerArchive = archives.rows.find((row) => row.member_id === actorId);
  expect(mariaArchive).toBeTruthy();
  expect(treasurerArchive).toBeTruthy();
  const mariaMovements = mariaArchive!.canonical_payload.verificationMovements;
  expect(mariaMovements).toEqual(expect.arrayContaining([
    expect.objectContaining({ datedOn: "2026-07-05", label: "Contribution", category: "regular", signedAmount: "100.0000" }),
    expect.objectContaining({ datedOn: "2026-07-22", label: "Calamidad doméstica E2E", category: "solidarity", signedAmount: "30.0000" }),
    expect.objectContaining({ datedOn: "2026-07-22", label: "pago solidario", category: "solidarity_payout", signedAmount: "-25.0000" }),
    expect.objectContaining({ datedOn: "2026-07-22", label: "pago a tesorera", category: "treasurer_comp_payout", signedAmount: "-25.0000" }),
    expect.objectContaining({ datedOn: "2026-07-22", label: "regularization", category: "regularization", signedAmount: "30.0000" }),
  ]));
  const movementOrder = mariaMovements.map((row) => `${row.datedOn}:${row.sourceKind}:${row.sourceId}`);
  expect(movementOrder).toEqual([...movementOrder].sort());
  const pdfResponse = await request.get(mariaArchive!.pdf_uri);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
  const blobPath = `monthly-member/${orgId}/${mariaArchive!.canonical_payload_hash}.pdf`;
  const blobInspection = await request.get(`http://127.0.0.1:3030/inspect?pathname=${encodeURIComponent(blobPath)}`);
  expect(blobInspection.status()).toBe(200);
  expect(await blobInspection.json()).toEqual({
    pathname: blobPath,
    byteSize: mariaArchive!.byte_size,
    prefix: "%PDF",
    request: {
      method: "PUT",
      authorization: "Bearer vercel_blob_rw_contract_secret",
      access: "private",
      allowOverwrite: "1",
      contentType: "application/pdf",
    },
  });

  await expect(page.getByRole("link", { name: "María Quishpe" })).toBeVisible();
  await page.getByRole("link", { name: "María Quishpe" }).click();
  await expect(page.getByText("Calamidad doméstica E2E")).toBeVisible();
  const memberRows = page.getByTestId("movements_transparency").locator("tbody tr");
  await expect(memberRows).toHaveCount(5);
  await expect(memberRows.filter({ hasText: "ContributionregularBanco del gruporegularized100.0000" })).toHaveCount(1);
  await expect(memberRows.filter({ hasText: "Calamidad doméstica E2EsolidarityCuenta personal de la tesoreraregularized30.0000" })).toHaveCount(1);
  await expect(memberRows.filter({ hasText: "pago solidariosolidarity_payoutBanco del grupoConciliado-25.0000" })).toHaveCount(1);
  await expect(memberRows.filter({ hasText: "pago a tesoreratreasurer_comp_payoutBanco del grupoConciliado-25.0000" })).toHaveCount(1);
  await expect(memberRows.filter({ hasText: "regularizationregularizationCuenta personal de la tesorera → Banco del grupoConciliado30.0000" })).toHaveCount(1);
  expect(await memberRows.locator("td:nth-child(2)").allTextContents()).toEqual(mariaMovements.map((row) => row.label));
  await expect(page.getByText(FOREIGN_SENTINEL)).toHaveCount(0);

  await page.goto(`/verify/${mariaArchive!.canonical_payload_hash}`);
  await expect(page.getByRole("heading", { level: 1, name: "Verificación de documento" })).toBeVisible();
  await expect(page.getByText("Documento auténtico")).toBeVisible();
  await expect(page.getByText("Calamidad doméstica E2E")).toBeVisible();
  const publicRows = page.getByTestId("movements_transparency").locator("tbody tr");
  await expect(publicRows).toHaveCount(5);
  await expect(publicRows.filter({ hasText: "ContributionregularBanco del gruporegularizedUSD 100.00" })).toHaveCount(1);
  await expect(publicRows.filter({ hasText: "Calamidad doméstica E2EsolidarityCuenta personal de la tesoreraregularizedUSD 30.00" })).toHaveCount(1);
  await expect(publicRows.filter({ hasText: "pago solidariosolidarity_payoutBanco del grupoConciliadoUSD -25.00" })).toHaveCount(1);
  await expect(publicRows.filter({ hasText: "pago a tesoreratreasurer_comp_payoutBanco del grupoConciliadoUSD -25.00" })).toHaveCount(1);
  await expect(publicRows.filter({ hasText: "regularizationregularizationCuenta personal de la tesorera → Banco del grupoConciliadoUSD 30.00" })).toHaveCount(1);
  expect(await publicRows.locator("td:nth-child(2)").allTextContents()).toEqual(mariaMovements.map((row) => row.label));
  await expect(page.getByText(FOREIGN_SENTINEL)).toHaveCount(0);

  await page.goto(`/verify/${treasurerArchive!.canonical_payload_hash}`);
  const treasurerRows = page.getByTestId("movements_transparency").locator("tbody tr");
  await expect(treasurerRows.filter({ hasText: /Withdrawaltreasurer_compensation_disbursement.*USD -10\.00/ })).toHaveCount(1);
  await expect(treasurerRows.filter({ hasText: /pago a tesoreratreasurer_comp_payout.*USD -25\.00/ })).toHaveCount(1);
  await expect(page.getByText(FOREIGN_SENTINEL)).toHaveCount(0);

  await page.context().setExtraHTTPHeaders({
    "x-e2e-auth-actor-id": nonTreasurerActorId,
    "x-e2e-auth-roles": "APORTANTE",
  });
  await page.goto("/estados");
  await expect(page).toHaveURL("http://127.0.0.1:3029/acceso-denegado");
  await expect(page.getByRole("heading", { level: 1, name: "Tu usuario no está listo para entrar" })).toBeVisible();
  await page.context().setExtraHTTPHeaders(treasurerHeaders);
  await page.goto("/estados");
  await expect(page.getByRole("heading", { level: 1, name: "Estados de cuenta" })).toBeVisible();
});

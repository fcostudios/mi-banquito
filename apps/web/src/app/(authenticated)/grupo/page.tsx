import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { saveTreasurerGroupConfigAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.config;
const groupCopy = messages.sprint1.group;

export default async function ScrGroupConfigPage({
  searchParams,
}: {
  searchParams?: Promise<{ editar?: string }>;
}) {
  const session = await requireTreasurer();
  const editing = (await searchParams)?.editar === "1";
  const config = await createLedgerService().getCurrentGroupConfig(session.orgId);
  const json = config?.config && typeof config.config === "object" ? config.config as {
    baseFundQuota?: { fiscalYear?: number; perMemberAmount?: string };
    nonMemberLoanRateValue?: string;
    adminFeePct?: string;
    referralCommissionAmount?: string;
    treasurerCompensation?: { kind?: string; amount?: string; period?: string };
    opensOnDay?: number;
  } : {};

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{groupCopy.title}</h1>
        <p className="mt-2 text-text-secondary">{groupCopy.description}</p>
        <p className="mt-2 text-sm text-text-secondary">{groupCopy.newLoans}</p>
      </header>
      <form action={saveTreasurerGroupConfigAction} className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-2">
        <fieldset name="group-rules" disabled={!editing} className="contents">
        <FormField labelKey={copy.contributionCycleKind}>
          <Select name="contributionCycleKind" defaultValue={config?.contributionCycleKind ?? "monthly"}>
            <option value="monthly">{copy.monthly}</option>
            <option value="weekly">{copy.weekly}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.contributionAmount}>
          <InputNumber name="contributionAmount" defaultValue={config?.contributionAmount ?? "20.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.opensOnDay}>
          <InputNumber name="opensOnDay" defaultValue={json.opensOnDay ?? 1} min="1" max="31" step="1" />
        </FormField>
        <input type="hidden" name="loanRateModel" value="declining_balance" />
        <FormField labelKey={copy.memberLoanRateValue}>
          <InputNumber name="memberLoanRateValue" defaultValue={config?.loanRateValue ?? "4.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.nonMemberLoanRateValue}>
          <InputNumber name="nonMemberLoanRateValue" defaultValue={json.nonMemberLoanRateValue ?? "5.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.loanRatePeriodUnit}>
          <Select name="loanRatePeriodUnit" defaultValue={config?.loanRatePeriodUnit ?? "monthly"}>
            <option value="monthly">{copy.monthly}</option>
            <option value="weekly">{copy.weekly}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.loanGracePeriods}>
          <InputNumber name="loanGracePeriods" defaultValue={config?.loanGracePeriods ?? 0} min="0" max="12" step="1" />
        </FormField>
        <FormField labelKey={copy.loanToSavingsCapRatio}>
          <InputNumber name="loanToSavingsCapRatio" defaultValue={config?.loanToSavingsCapRatio ?? "2.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.adminFeePct}>
          <InputNumber name="adminFeePct" defaultValue={json.adminFeePct ?? "1.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.referralCommissionAmount}>
          <InputNumber name="referralCommissionAmount" defaultValue={json.referralCommissionAmount ?? "5.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.treasurerCompensationKind}>
          <Select name="treasurerCompensationKind" defaultValue={json.treasurerCompensation?.kind ?? "fixed"}>
            <option value="fixed">{copy.fixed}</option>
            <option value="percentage">{copy.percentage}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.treasurerCompensationAmount}>
          <InputNumber name="treasurerCompensationAmount" defaultValue={json.treasurerCompensation?.amount ?? "10.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.treasurerCompensationPeriod}>
          <Select name="treasurerCompensationPeriod" defaultValue={json.treasurerCompensation?.period ?? "monthly"}>
            <option value="monthly">{copy.monthly}</option>
            <option value="cycle">{copy.cycle}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.baseFundQuotaFiscalYear}>
          <InputNumber name="baseFundQuotaFiscalYear" defaultValue={json.baseFundQuota?.fiscalYear ?? new Date().getUTCFullYear()} min="2000" max="2100" step="1" />
        </FormField>
        <FormField labelKey={copy.baseFundQuotaAmount}>
          <InputNumber name="baseFundQuotaAmount" defaultValue={json.baseFundQuota?.perMemberAmount ?? "25.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.fiscalYearStartMonth}>
          <InputNumber name="fiscalYearStartMonth" defaultValue={config?.fiscalYearStartMonth ?? 1} min="1" max="12" step="1" />
        </FormField>
        <FormField labelKey={copy.fiscalYearStartDay}>
          <InputNumber name="fiscalYearStartDay" defaultValue={config?.fiscalYearStartDay ?? 1} min="1" max="31" step="1" />
        </FormField>
        <input type="hidden" name="yearEndShareOutFormula" value="proportional_time_weighted" />
        <FormField labelKey={copy.reconciliationToleranceAmount}>
          <InputNumber name="reconciliationToleranceAmount" defaultValue={config?.reconciliationToleranceAmount ?? "1.00"} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.lateThresholdDays}>
          <InputNumber name="lateThresholdDays" defaultValue={config?.lateThresholdDays ?? 3} min="0" max="365" step="1" />
        </FormField>
        <FormField labelKey={copy.moraThresholdDays}>
          <InputNumber name="moraThresholdDays" defaultValue={config?.moraThresholdDays ?? 15} min="1" max="365" step="1" />
        </FormField>
        </fieldset>
        <div className="md:col-span-2">
          {editing ? (
            <ButtonPrimary type="submit" labelKey={messages.sprint1.common.save} />
          ) : (
            <a
              href="/grupo?editar=1"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-5 font-semibold text-surface"
            >
              {groupCopy.edit}
            </a>
          )}
        </div>
      </form>
    </main>
  );
}

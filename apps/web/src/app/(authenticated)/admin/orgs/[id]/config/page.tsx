import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import {
  ButtonPrimary,
  FormField,
  InputNumber,
  Select,
} from "@mi-banquito/ui";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { saveAdminGroupConfigAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.config;

type ConfigJson = {
  baseFundQuota?: {
    fiscalYear?: number;
    perMemberAmount?: string;
  };
  nonMemberLoanRateValue?: string;
  adminFeePct?: string;
  referralCommissionAmount?: string;
  treasurerCompensation?: {
    kind?: string;
    amount?: string;
    period?: string;
  };
  opensOnDay?: number;
};

function asConfigJson(value: unknown): ConfigJson {
  return value && typeof value === "object" ? value : {};
}

function currentFiscalYear() {
  return new Date().getUTCFullYear();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border pt-5">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function ScrAdminOrgConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;
  const service = createPlatformService();
  const org = await service.getOrganization(id);

  if (!org) {
    notFound();
  }

  const current = await service.getCurrentGroupConfig(org.id);
  const config = asConfigJson(current?.config);
  const save = saveAdminGroupConfigAction.bind(null, org.id);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
        {current ? (
          <p className="mt-2 text-sm text-text-secondary">
            {copy.currentVersion}: {current.version}
          </p>
        ) : null}
      </header>

      <form action={save} className="grid gap-6 rounded-md border border-border bg-surface p-5">
        <Section title={copy.aportes}>
          <FormField labelKey={copy.contributionCycleKind}>
            <Select name="contributionCycleKind" defaultValue={current?.contributionCycleKind ?? "monthly"}>
              <option value="monthly">{copy.monthly}</option>
              <option value="weekly">{copy.weekly}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.contributionAmount}>
            <InputNumber
              name="contributionAmount"
              defaultValue={current?.contributionAmount ?? "20.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.opensOnDay}>
            <InputNumber
              name="opensOnDay"
              defaultValue={config.opensOnDay ?? 1}
              min="1"
              max="31"
              step="1"
            />
          </FormField>
        </Section>

        <Section title={copy.prestamos}>
          <FormField labelKey={copy.loanRateModel}>
            <Select name="loanRateModel" defaultValue={current?.loanRateModel ?? "declining_balance"}>
              <option value="declining_balance">{copy.decliningBalance}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.memberLoanRateValue}>
            <InputNumber
              name="memberLoanRateValue"
              defaultValue={current?.loanRateValue ?? "4.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.nonMemberLoanRateValue}>
            <InputNumber
              name="nonMemberLoanRateValue"
              defaultValue={config.nonMemberLoanRateValue ?? "5.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.loanRatePeriodUnit}>
            <Select name="loanRatePeriodUnit" defaultValue={current?.loanRatePeriodUnit ?? "monthly"}>
              <option value="monthly">{copy.monthly}</option>
              <option value="weekly">{copy.weekly}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.loanGracePeriods}>
            <InputNumber
              name="loanGracePeriods"
              defaultValue={current?.loanGracePeriods ?? 0}
              min="0"
              max="12"
              step="1"
            />
          </FormField>
          <FormField labelKey={copy.loanToSavingsCapRatio}>
            <InputNumber
              name="loanToSavingsCapRatio"
              defaultValue={current?.loanToSavingsCapRatio ?? "2.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.adminFeePct}>
            <InputNumber
              name="adminFeePct"
              defaultValue={config.adminFeePct ?? "1.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.referralCommissionAmount}>
            <InputNumber
              name="referralCommissionAmount"
              defaultValue={config.referralCommissionAmount ?? "5.00"}
              min="0"
              step="0.01"
            />
          </FormField>
        </Section>

        <Section title={copy.cuotaBase}>
          <FormField labelKey={copy.baseFundQuotaFiscalYear}>
            <InputNumber
              name="baseFundQuotaFiscalYear"
              defaultValue={config.baseFundQuota?.fiscalYear ?? currentFiscalYear()}
              min="2000"
              max="2100"
              step="1"
            />
          </FormField>
          <FormField labelKey={copy.baseFundQuotaAmount}>
            <InputNumber
              name="baseFundQuotaAmount"
              defaultValue={config.baseFundQuota?.perMemberAmount ?? "25.00"}
              min="0"
              step="0.01"
            />
          </FormField>
        </Section>

        <Section title={copy.cierreReparto}>
          <FormField labelKey={copy.fiscalYearStartMonth}>
            <InputNumber
              name="fiscalYearStartMonth"
              defaultValue={current?.fiscalYearStartMonth ?? 1}
              min="1"
              max="12"
              step="1"
            />
          </FormField>
          <FormField labelKey={copy.fiscalYearStartDay}>
            <InputNumber
              name="fiscalYearStartDay"
              defaultValue={current?.fiscalYearStartDay ?? 1}
              min="1"
              max="31"
              step="1"
            />
          </FormField>
          <FormField labelKey={copy.yearEndShareOutFormula}>
            <Select
              name="yearEndShareOutFormula"
              defaultValue={current?.yearEndShareOutFormula ?? "proportional_time_weighted"}
            >
              <option value="proportional_time_weighted">{copy.proportionalTimeWeighted}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.reconciliationToleranceAmount}>
            <InputNumber
              name="reconciliationToleranceAmount"
              defaultValue={current?.reconciliationToleranceAmount ?? "1.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.treasurerCompensationKind}>
            <Select
              name="treasurerCompensationKind"
              defaultValue={config.treasurerCompensation?.kind ?? "fixed"}
            >
              <option value="fixed">{copy.fixed}</option>
              <option value="percentage">{copy.percentage}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.treasurerCompensationAmount}>
            <InputNumber
              name="treasurerCompensationAmount"
              defaultValue={config.treasurerCompensation?.amount ?? "10.00"}
              min="0"
              step="0.01"
            />
          </FormField>
          <FormField labelKey={copy.treasurerCompensationPeriod}>
            <Select
              name="treasurerCompensationPeriod"
              defaultValue={config.treasurerCompensation?.period ?? "monthly"}
            >
              <option value="monthly">{copy.monthly}</option>
              <option value="cycle">{copy.cycle}</option>
            </Select>
          </FormField>
        </Section>

        <Section title={copy.alertasAtraso}>
          <FormField labelKey={copy.lateThresholdDays}>
            <InputNumber
              name="lateThresholdDays"
              defaultValue={current?.lateThresholdDays ?? 3}
              min="0"
              max="365"
              step="1"
            />
          </FormField>
          <FormField labelKey={copy.moraThresholdDays}>
            <InputNumber
              name="moraThresholdDays"
              defaultValue={current?.moraThresholdDays ?? 15}
              min="1"
              max="365"
              step="1"
            />
          </FormField>
        </Section>

        <div>
          <ButtonPrimary type="submit" labelKey={copy.save} />
        </div>
      </form>
    </main>
  );
}

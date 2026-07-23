import { createLiquidityService } from "@mi-banquito/domain";
import { formatUsdMoney4 } from "@mi-banquito/ui";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

import { LiquiditySandbox } from "./liquidity-sandbox";

export const dynamic = "force-dynamic";

const copy = messages.liquidez;

export default async function ScrCashFlowProjectionPage() {
  const session = await requireTreasurer();
  const projection = await createLiquidityService().getProjection(session.orgId);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6" data-screen="SCR-cash-flow-projection">
      <header>
        <h1 className="text-3xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </header>

      <section className="grid gap-3 rounded-md border border-border bg-surface p-5 md:grid-cols-2 xl:grid-cols-5" data-testid="available_capital">
        <div data-testid="physical_cash_balance">
          <p className="text-sm text-text-secondary">{copy.physicalCashBalance}</p>
          <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(projection.physicalCashBalance)}</p>
        </div>
        <div data-testid="collection_cash_balance">
          <p className="text-sm text-text-secondary">{copy.collectionCashBalance}</p>
          <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(projection.collectionCashBalance)}</p>
        </div>
        <div data-testid="pool_balance">
          <p className="text-sm text-text-secondary">{copy.regularizedDistributableBalance}</p>
          <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(projection.regularizedDistributableBalance)}</p>
        </div>
        <div data-testid="available_capital_value">
          <p className="text-sm text-text-secondary">{copy.availableCapital}</p>
          <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(projection.availableCapital)}</p>
        </div>
        <div data-testid="base_fund_pool">
          <p className="text-sm text-text-secondary">{copy.baseFundPool}</p>
          <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(projection.baseFundPool)}</p>
        </div>
        <p className="text-sm text-text-secondary md:col-span-2 xl:col-span-5">{copy.baseFundExplanation}</p>
      </section>

      <section className="rounded-md border border-border bg-surface p-5" data-testid="narrative">
        <h2 className="text-xl font-semibold text-text-primary">{copy.summary}</h2>
        <p className="mt-2 text-text-secondary">{projection.narrative}</p>
      </section>

      <LiquiditySandbox
        commitment={projection.commitment}
        copy={{
          amount: copy.sandboxAmount,
          calculation: copy.sandboxCalculation,
          parameters: copy.sandboxParameters,
          projection: copy.projection,
          rate: copy.sandboxRate,
          term: copy.sandboxTerm,
          termUnit: copy.sandboxTermUnit,
          title: copy.sandboxTitle,
        }}
        series={projection.series}
        terms={projection.hypotheticalLoanTerms}
      />
    </main>
  );
}

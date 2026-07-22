import type { ReactNode } from "react";
import { formatUsdMoney4 } from "../money4";

export interface YearEndShareOutEditorProps {
  shareOut: {
    id: string;
    year: number;
    status: string;
    repartoTotal: string | null;
    loanPoolAmount: string | null;
    savingsPoolAmount: string | null;
    ajusteAmount: string | null;
  };
  lines: Array<{
    id: string;
    memberName: string;
    accumulatedSavingsAtRun: string;
    loanActivityBasis: string | null;
    loanBonusC: string | null;
    savingsInterest: string | null;
    draftShareAmount: string;
    overrideReason: string | null;
    finalShareAmount: string;
  }>;
  overrideAction: (formData: FormData) => void | Promise<void>;
  approveAction: (formData: FormData) => void | Promise<void>;
  labels: {
    year: string;
    total: string;
    loanPool: string;
    adjustment: string;
    member: string;
    savings: string;
    loanActivity: string;
    draft: string;
    final: string;
    override: string;
    finalAmountForMember: (memberName: string) => string;
    reasonForMember: (memberName: string) => string;
    saveOverride: string;
    approve: string;
    reasonPlaceholder: string;
  };
  approveControl?: ReactNode;
  className?: string;
}

function usd(value: string | null | undefined) {
  return formatUsdMoney4(value, "code");
}

export function YearEndShareOutEditor(props: YearEndShareOutEditorProps) {
  return (
    <section
      className={["grid gap-5 rounded-md border border-border bg-surface p-5 text-text-primary", props.className].filter(Boolean).join(" ")}
      data-organism="year-end-share-out-editor"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <p className="text-sm text-text-secondary">{props.labels.year}</p>
          <p className="text-xl font-bold">{props.shareOut.year}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">{props.labels.total}</p>
          <p className="text-xl font-bold">{usd(props.shareOut.repartoTotal)}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">{props.labels.loanPool}</p>
          <p className="text-xl font-bold">{usd(props.shareOut.loanPoolAmount)}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">{props.labels.adjustment}</p>
          <p className="text-xl font-bold">{usd(props.shareOut.ajusteAmount)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">{props.labels.member}</th>
              <th className="px-3 py-2 font-medium">{props.labels.savings}</th>
              <th className="px-3 py-2 font-medium">{props.labels.loanActivity}</th>
              <th className="px-3 py-2 font-medium">{props.labels.draft}</th>
              <th className="px-3 py-2 font-medium">{props.labels.final}</th>
              <th className="px-3 py-2 font-medium">{props.labels.override}</th>
            </tr>
          </thead>
          <tbody>
            {props.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3 font-medium">{line.memberName}</td>
                <td className="px-3 py-3">{usd(line.accumulatedSavingsAtRun)}</td>
                <td className="px-3 py-3">{usd(line.loanActivityBasis)}</td>
                <td className="px-3 py-3">{usd(line.draftShareAmount)}</td>
                <td className="px-3 py-3 font-semibold">{usd(line.finalShareAmount)}</td>
                <td className="px-3 py-3">
                  {props.shareOut.status === "draft" ? (
                    <form action={props.overrideAction} className="grid min-w-64 gap-2">
                      <input type="hidden" name="lineId" value={line.id} />
                      <input
                        className="min-h-10 rounded-md border border-border bg-surface px-3"
                        name="overrideAmount"
                        inputMode="decimal"
                        defaultValue={line.finalShareAmount}
                        aria-label={props.labels.finalAmountForMember(line.memberName)}
                      />
                      <input
                        className="min-h-10 rounded-md border border-border bg-surface px-3"
                        name="reason"
                        defaultValue={line.overrideReason ?? ""}
                        aria-label={props.labels.reasonForMember(line.memberName)}
                        placeholder={props.labels.reasonPlaceholder}
                      />
                      <button className="min-h-10 rounded-md border border-primary bg-surface px-3 font-semibold text-primary" type="submit">
                        {props.labels.saveOverride}
                      </button>
                    </form>
                  ) : line.overrideReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {props.shareOut.status === "draft" ? (
        props.approveControl ?? (
          <form action={props.approveAction}>
            <input type="hidden" name="shareOutId" value={props.shareOut.id} />
            <button className="min-h-12 rounded-md bg-primary px-4 font-semibold text-text-on-primary" type="submit">
              {props.labels.approve}
            </button>
          </form>
        )
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { ButtonPrimary, FormField, InputText, Select } from "@mi-banquito/ui";

import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_RECORD_MOVEMENT, ROUTE_SCR_SOLIDARITY_COLLECTION } from "@/lib/routes";

type FormAction = (formData: FormData) => void | Promise<void>;
type SearchValue = string | string[] | undefined;
type CollectionStatus = "open" | "collecting" | "paid_out" | "closed" | "cancelled";
type CollectionDisposition = "returned" | "retained";

export type CollectionScreenModel = {
  today: string;
  recognitionFiscalYear: number;
  search: Record<string, SearchValue>;
  requestIds: Record<"open" | "addLine" | "payout" | "cancel" | "closeRecognition", string>;
  lineRequestIds: Record<string, { reverse: string; regularize: string }>;
  members: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; isGroupFund: boolean }>;
  collections: Array<{ id: string; purpose: string; status: CollectionStatus }>;
  selected: null | {
    id: string;
    kind: "solidarity" | "treasurer_recognition";
    purpose: string;
    beneficiaryName: string;
    targetAmount: string | null;
    status: CollectionStatus;
    progress: { contributors: number; activeMembers: number; collected: string; regularized: string; pending: string };
    surplusAmount: string | null;
    disposition: CollectionDisposition | null;
    dispositionMotive: string | null;
    lines: Array<{
      id: string;
      memberName: string;
      amount: string;
      accountName: string;
      accountId: string;
      remaining: string;
      reconciliationStatus: "pending" | "regularized";
      reversesId: string | null;
    }>;
  };
};

export type CollectionActions = {
  open: FormAction;
  addLine: FormAction;
  reverseLine: FormAction;
  regularize: FormAction;
  payout: FormAction;
  cancel: FormAction;
  closeRecognition: FormAction;
};

const copy = messages.collections;

function money4Units(value: string): bigint | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * BigInt(10_000) + BigInt((match[2] ?? "").padEnd(4, "0"));
}

export function exceedsMoney4Ceiling(value: string, ceiling: string): boolean {
  const amount = money4Units(value);
  const maximum = money4Units(ceiling);
  return amount !== null && maximum !== null && amount > maximum;
}

function collectionHref(collectionId: string): string {
  return `${ROUTE_SCR_SOLIDARITY_COLLECTION}?${new URLSearchParams({ collectionId }).toString()}`;
}

function regularizationHref(lineId: string): string {
  return `${ROUTE_SCR_RECORD_MOVEMENT}?${new URLSearchParams({ regularizesKind: "extraordinary_collection", regularizesId: lineId }).toString()}`;
}

function scalar(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function Feedback({ search }: { search: Record<string, SearchValue> }) {
  if (scalar(search.saved) === "1") {
    return <div className="rounded-md border border-success bg-surface p-3 text-sm font-semibold text-text-primary" role="status">{copy.success}</div>;
  }
  const code = scalar(search.error);
  const text = code && Object.prototype.hasOwnProperty.call(copy.errors, code)
    ? copy.errors[code as keyof typeof copy.errors]
    : undefined;
  return text ? <div className="rounded-md border border-error-text bg-error-bg p-3 text-sm font-semibold text-text-primary" role="alert">{text}</div> : null;
}

function MemberOptions({ model }: { model: CollectionScreenModel }) {
  return model.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>);
}

function AccountOptions({ model, groupFund }: { model: CollectionScreenModel; groupFund?: boolean }) {
  return model.accounts
    .filter((account) => groupFund === undefined || account.isGroupFund === groupFund)
    .map((account) => <option key={account.id} value={account.id}>{account.name}</option>);
}

function DispositionFields({ model, prefix }: { model: CollectionScreenModel; prefix: string }) {
  return (
    <>
      <FormField controlId={`${prefix}-disposition`} labelKey={copy.surplusChoice}>
        <Select data-testid={prefix === "payout" ? "surplus_disposition" : undefined} id={`${prefix}-disposition`} name="disposition" defaultValue="">
          <option value="">{copy.surplusEmpty}</option>
          <option value="returned">{copy.surplusReturn}</option>
          <option value="retained">{copy.surplusRetain}</option>
        </Select>
      </FormField>
      <FormField controlId={`${prefix}-return-account`} labelKey={copy.returnAccount}>
        <Select id={`${prefix}-return-account`} name="returnAccountId" defaultValue="">
          <option value="">{copy.surplusEmpty}</option>
          <AccountOptions model={model} groupFund={false} />
        </Select>
      </FormField>
      <FormField controlId={`${prefix}-motive`} labelKey={copy.voteReference}>
        <InputText id={`${prefix}-motive`} labelKey={copy.voteReference} name="dispositionMotive" maxLength={500} />
      </FormField>
    </>
  );
}

function CollectionSummary({ selected }: { selected: NonNullable<CollectionScreenModel["selected"]> }) {
  const target = selected.targetAmount ? copy.targetProgress.replace("{{target}}", selected.targetAmount) : "";
  let surplus: string | null = null;
  if (selected.surplusAmount === "0.0000") surplus = copy.surplusNone;
  if (selected.surplusAmount && selected.disposition === "returned") surplus = copy.surplusReturned.replace("{{amount}}", selected.surplusAmount);
  if (selected.surplusAmount && selected.disposition === "retained") surplus = copy.surplusRetained.replace("{{amount}}", selected.surplusAmount);
  return (
    <section className="grid gap-2 rounded-md border border-info-text bg-info-bg p-4 text-text-primary" data-testid="collection_summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{copy.summaryTitle}</h2>
        <span className="rounded-full border border-info-text px-3 py-1 text-sm font-semibold">{copy.status[selected.status]}</span>
      </div>
      <p>{copy.purposePrefix.replace("{{purpose}}", selected.purpose)}</p>
      <p>{copy.beneficiaryPrefix.replace("{{beneficiary}}", selected.beneficiaryName)}</p>
      <p>{copy.contributors.replace("{{contributors}}", String(selected.progress.contributors)).replace("{{members}}", String(selected.progress.activeMembers))}</p>
      <p>{copy.collected.replace("{{amount}}", selected.progress.collected)}{target}</p>
      <div className="grid grid-cols-1 gap-2 text-sm font-semibold sm:grid-cols-2">
        <span>{copy.regularized.replace("{{amount}}", selected.progress.regularized)}</span>
        <span>{copy.pending.replace("{{amount}}", selected.progress.pending)}</span>
      </div>
      {surplus ? <p className="font-semibold">{surplus}</p> : null}
    </section>
  );
}

export function CollectionForms({ model, actions }: { model: CollectionScreenModel; actions: CollectionActions }) {
  const [openKind, setOpenKind] = useState<"solidarity" | "treasurer_recognition">("solidarity");
  const [payoutAboveCeiling, setPayoutAboveCeiling] = useState(false);
  const selected = model.selected;
  const mutable = selected?.status === "open" || selected?.status === "collecting";
  const hasPending = selected?.progress.pending !== "0.0000";
  const groupAccounts = model.accounts.filter((account) => account.isGroupFund);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6" data-screen="SCR-solidarity-collection">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-sm text-text-secondary">{copy.subtitle}</p>
      </header>
      <Feedback search={model.search} />

      <section className="rounded-md border border-border bg-surface p-4" data-testid="collection_picker">
        <h2 className="font-semibold text-text-primary">{copy.selectTitle}</h2>
        {model.collections.length === 0 ? <p className="mt-2 text-sm text-text-secondary">{copy.noCollections}</p> : (
          <div className="mt-2 flex flex-wrap gap-2">
            {model.collections.map((collection) => (
              <a className="min-h-12 rounded-md border border-border px-4 py-3 font-semibold text-primary" href={collectionHref(collection.id)} key={collection.id}>
                {collection.purpose} · {copy.status[collection.status]}
              </a>
            ))}
          </div>
        )}
      </section>

      {selected ? <CollectionSummary selected={selected} /> : null}

      <form action={actions.open} className="grid gap-4 rounded-md border border-border bg-surface p-4" data-testid="form_open_collection">
        <h2 className="text-lg font-semibold text-text-primary">{copy.openTitle}</h2>
        <input name="clientRequestId" type="hidden" value={model.requestIds.open} />
        <FormField controlId="collection-purpose" labelKey={copy.purpose}><InputText data-testid="purpose" id="collection-purpose" labelKey={copy.purpose} name="purpose" minLength={3} maxLength={500} required /></FormField>
        <FormField controlId="collection-beneficiary" labelKey={copy.beneficiary}><Select data-testid="beneficiary_member_id" id="collection-beneficiary" name="beneficiaryMemberId" required><MemberOptions model={model} /></Select></FormField>
        <FormField controlId="collection-kind" labelKey={copy.kind}><Select data-testid="kind" id="collection-kind" name="kind" value={openKind} onChange={(event) => setOpenKind(event.currentTarget.value as typeof openKind)} required><option value="solidarity">{copy.solidarity}</option><option value="treasurer_recognition">{copy.recognition}</option></Select></FormField>
        {openKind === "treasurer_recognition" ? <FormField controlId="collection-year" labelKey={copy.recognitionYear}><input className="min-h-12 w-full rounded-md border border-border bg-surface px-4" id="collection-year" name="recognitionFiscalYear" type="number" min={2000} max={2200} defaultValue={model.recognitionFiscalYear} required /></FormField> : <input name="recognitionFiscalYear" type="hidden" value="" />}
        <FormField controlId="collection-target" labelKey={copy.target}><InputText data-testid="target_amount" id="collection-target" inputMode="decimal" labelKey={copy.target} name="targetAmount" /></FormField>
        <FormField controlId="collection-opened-on" labelKey={copy.openedOn}><InputText id="collection-opened-on" labelKey={copy.openedOn} name="openedOn" type="date" defaultValue={model.today} required /></FormField>
        <ButtonPrimary data-testid="btn_open_collection" disabled={model.members.length === 0} labelKey={copy.openSubmit} type="submit" />
      </form>

      {mutable && selected ? (
        <form action={actions.addLine} className="grid gap-4 rounded-md border border-border bg-surface p-4" data-testid="form_add_line">
          <h2 className="text-lg font-semibold text-text-primary">{copy.addTitle}</h2>
          <input name="clientRequestId" type="hidden" value={model.requestIds.addLine} /><input name="collectionId" type="hidden" value={selected.id} /><input name="datedOn" type="hidden" value={model.today} />
          <FormField controlId="line-member" labelKey={copy.member}><Select data-testid="member_id" id="line-member" name="memberId" required><MemberOptions model={model} /></Select></FormField>
          <FormField controlId="line-amount" labelKey={copy.amount}><InputText data-testid="amount" id="line-amount" inputMode="decimal" labelKey={copy.amount} name="amount" required /></FormField>
          <FormField controlId="line-account" labelKey={copy.account}><Select data-testid="account_id" id="line-account" name="accountId" required><AccountOptions model={model} /></Select></FormField>
          <ButtonPrimary data-testid="btn_add_line" disabled={model.members.length === 0 || model.accounts.length === 0} labelKey={copy.addSubmit} type="submit" />
        </form>
      ) : null}

      {selected ? (
        <section className="overflow-x-auto rounded-md border border-border bg-surface p-4" data-testid="lines_table">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">{copy.linesTitle}</h2>
          {selected.lines.length === 0 ? <p className="text-sm text-text-secondary">{copy.emptyLines}</p> : (
            <table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">{copy.lineMember}</th><th className="p-2">{copy.lineAmount}</th><th className="p-2">{copy.lineAccount}</th><th className="p-2">{copy.lineStatus}</th><th className="p-2">{copy.reverse}</th></tr></thead><tbody>
              {selected.lines.map((line) => <tr className="border-b border-border" key={line.id}><td className="p-2">{line.memberName}</td><td className="p-2">USD {line.amount}</td><td className="p-2">{line.accountName}</td><td className="p-2">{line.reconciliationStatus === "pending" ? copy.linePending : copy.lineRegularized}</td><td className="p-2">{mutable && line.reversesId === null ? <div className="grid gap-2">{line.reconciliationStatus === "pending" ? <><a className="inline-flex min-h-12 items-center font-semibold text-primary" href={regularizationHref(line.id)}>{copy.regularize}</a><form action={actions.regularize} className="grid gap-2 rounded-md border border-border p-2" data-command="regularize"><input name="clientRequestId" type="hidden" value={model.lineRequestIds[line.id]?.regularize} /><input name="collectionId" type="hidden" value={selected.id} /><input name="lineId" type="hidden" value={line.id} /><input name="sourceAccountId" type="hidden" value={line.accountId} /><input name="amount" type="hidden" value={line.remaining} /><input name="datedOn" type="hidden" value={model.today} /><Select aria-label={copy.regularizationTarget} name="toAccountId" required><AccountOptions model={model} groupFund /></Select><label className="flex min-h-12 items-center gap-2"><input name="confirmed" type="checkbox" value="yes" required /><span>{copy.regularizationConfirm}</span></label><button className="min-h-12 font-semibold text-primary" type="submit">{copy.regularizationSubmit}</button></form></> : null}<form action={actions.reverseLine} data-command="reverse"><input name="clientRequestId" type="hidden" value={model.lineRequestIds[line.id]?.reverse} /><input name="collectionId" type="hidden" value={selected.id} /><input name="lineId" type="hidden" value={line.id} /><input aria-label={copy.reversalReason} className="min-h-12 rounded-md border border-border px-2" name="reason" minLength={10} required /><button className="min-h-12 font-semibold text-secondary" type="submit">{copy.reverse}</button></form></div> : null}</td></tr>)}
            </tbody></table>
          )}
        </section>
      ) : null}

      {selected?.status === "collecting" && selected.kind === "solidarity" ? (
        <form action={actions.payout} className="grid gap-4 rounded-md border border-border bg-surface p-4" data-testid="form_payout">
          <h2 className="text-lg font-semibold text-text-primary">{copy.payoutTitle}</h2>
          <input name="clientRequestId" type="hidden" value={model.requestIds.payout} /><input name="collectionId" type="hidden" value={selected.id} /><input name="datedOn" type="hidden" value={model.today} />
          <FormField controlId="payout-account" labelKey={copy.sourceAccount}><Select id="payout-account" name="sourceAccountId" required><AccountOptions model={model} groupFund /></Select></FormField>
          <FormField controlId="payout-amount" labelKey={copy.payoutAmount} errorMessageKey={payoutAboveCeiling ? copy.errors["collection-payout-above-ceiling"] : undefined}><InputText aria-invalid={payoutAboveCeiling} data-testid="payout_amount" id="payout-amount" inputMode="decimal" labelKey={copy.payoutAmount} max={selected.progress.regularized} name="payoutAmount" onInput={(event) => { const invalid = exceedsMoney4Ceiling(event.currentTarget.value, selected.progress.regularized); event.currentTarget.setCustomValidity(invalid ? copy.errors["collection-payout-above-ceiling"] : ""); setPayoutAboveCeiling(invalid); }} pattern="[0-9]+([.][0-9]{1,4})?" required /></FormField>
          <p className="text-sm text-text-secondary">{copy.payoutCeiling.replace("{{amount}}", selected.progress.regularized)}</p>
          <DispositionFields model={model} prefix="payout" />
          {hasPending ? <p className="rounded-md border border-warning-text bg-warning-bg p-3 text-sm text-text-primary" data-testid="payout_guard">{copy.payoutBlocked}</p> : <div data-testid="payout_guard" />}
          <ButtonPrimary data-testid="btn_payout" disabled={hasPending || payoutAboveCeiling || groupAccounts.length === 0} labelKey={copy.payoutSubmit} type="submit" />
        </form>
      ) : null}

      {selected?.status === "collecting" && selected.kind === "treasurer_recognition" ? (
        <form action={actions.closeRecognition} className="grid gap-4 rounded-md border border-border bg-surface p-4" data-testid="form_close_recognition">
          <h2 className="text-lg font-semibold text-text-primary">{copy.recognitionCloseTitle}</h2><p className="text-sm text-text-secondary">{copy.recognitionCloseHelp}</p>
          <input name="clientRequestId" type="hidden" value={model.requestIds.closeRecognition} /><input name="collectionId" type="hidden" value={selected.id} />
          <FormField controlId="recognition-motive" labelKey={copy.voteReference}><InputText id="recognition-motive" labelKey={copy.voteReference} name="dispositionMotive" minLength={3} maxLength={500} required /></FormField>
          <ButtonPrimary disabled={hasPending || selected.progress.regularized === "0.0000"} labelKey={copy.recognitionCloseSubmit} type="submit" />
        </form>
      ) : null}

      {mutable && selected ? (
        <form action={actions.cancel} className="grid gap-4 rounded-md border border-border bg-surface p-4" data-testid="form_cancel_collection">
          <h2 className="text-lg font-semibold text-text-primary">{copy.cancelTitle}</h2><p className="text-sm text-text-secondary">{copy.cancelHelp}</p>
          <input name="clientRequestId" type="hidden" value={model.requestIds.cancel} /><input name="collectionId" type="hidden" value={selected.id} /><input name="datedOn" type="hidden" value={model.today} />
          <DispositionFields model={model} prefix="cancel" />
          <ButtonPrimary labelKey={copy.cancelSubmit} type="submit" />
        </form>
      ) : null}
    </main>
  );
}

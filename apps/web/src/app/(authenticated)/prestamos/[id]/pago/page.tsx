import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createLoanService, createMovementService, createPaymentService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Radio, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { recordRepaymentAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.repayment;

type PreviewAllocation = Awaited<ReturnType<ReturnType<typeof createPaymentService>["previewMemberPayment"]>>["allocations"][number];

function hasHigherPriorityAllocation(allocations: PreviewAllocation[], targetLoanId: string): boolean {
  return allocations.some((line) => line.kind !== "loan_principal" || line.loanId !== targetLoanId);
}

export default async function ScrRecordRepaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTreasurer();
  const { id } = await params;
  const [detail, accounts] = await Promise.all([
    createLoanService().getLoanDetail(session.orgId, id),
    createMovementService().listActiveAccounts(session.orgId),
  ]);
  if (!detail) notFound();
  const groupAccount = accounts.find((account) => account.isGroupFund);
  const paymentMemberId = detail.borrowerMemberId ?? detail.guarantorMemberId;
  const preview = paymentMemberId && groupAccount
    ? await createPaymentService().previewMemberPayment({
      orgId: session.orgId,
      actorId: session.actorId,
      clientRequestId: randomUUID(),
      memberId: paymentMemberId,
      accountId: groupAccount.id,
      amount: "1.0000",
      datedOn: todayISO(),
      paymentSource: "cash_in_meeting",
      targetLoanId: detail.id,
      extraDecision: "loan_principal",
    }).catch(() => undefined)
    : undefined;
  const showWaterfallWarning = preview ? hasHigherPriorityAllocation(preview.allocations, detail.id) : false;
  const accountLabel = (account: (typeof accounts)[number]) => {
    const suffix = account.last4 ? ` ****${account.last4}` : "";
    return account.isGroupFund
      ? `${account.name}${suffix} - fondo del grupo`
      : `${account.name}${suffix} - pendiente de regularizar`;
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" data-screen="SCR-record-repayment">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-text-secondary">{detail.borrowerName}</p>
      </div>
      {!groupAccount ? (
        <div className="rounded-md border border-warning-text bg-warning-bg p-4 text-text-primary" role="alert">
          <h2 className="font-semibold">{copy.noGroupAccountTitle}</h2>
          <p className="mt-1 text-sm">{copy.noGroupAccountBody}</p>
        </div>
      ) : <form action={recordRepaymentAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        {showWaterfallWarning ? (
          <div className="rounded-md border border-warning bg-surface p-3 text-sm text-text-secondary" role="status">
            {copy.waterfallWarning}
          </div>
        ) : null}
        <input type="hidden" name="clientRequestId" value={randomUUID()} />
        <input type="hidden" name="loanId" value={detail.id} />
        <FormField controlId="repayment-account" helperTextKey={copy.accountHelp} labelKey={copy.account}>
          <Select id="repayment-account" name="accountId" defaultValue={groupAccount.id} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </Select>
        </FormField>
        <FormField labelKey={copy.amount}>
          <InputNumber name="amount" min="0.01" step="0.01" required />
        </FormField>
        <FormField labelKey={copy.datedOn}>
          <InputText labelKey={copy.datedOn} name="datedOn" type="date" defaultValue={todayISO()} required />
        </FormField>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-text-primary">{copy.mode}</legend>
          <div className="grid gap-1">
            <Radio name="paymentMode" value="next_installment" defaultChecked label={copy.nextInstallment} />
            <Radio name="paymentMode" value="principal_payment" label={copy.principalPayment} />
          </div>
        </fieldset>
        <FormField labelKey={copy.slip}>
          <InputText labelKey={copy.slip} name="slipPhotoId" />
        </FormField>
        <FormField labelKey={copy.notes}>
          <InputText labelKey={copy.notes} name="notes" />
        </FormField>
        <div>
          <ButtonPrimary type="submit" labelKey={copy.submit} />
        </div>
      </form>}
    </main>
  );
}

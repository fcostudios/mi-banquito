"use client";

import { useState } from "react";
import { ButtonPrimary, FormField, InputNumber, InputText, Select } from "@mi-banquito/ui";
import { originateLoanAction } from "./actions";

type MemberOption = {
  id: string;
  displayName: string;
};

type LoanCopy = {
  borrowerSection: string;
  borrowerKind: string;
  borrowerKindMember: string;
  borrowerKindNonMember: string;
  borrowerMember: string;
  selectMember: string;
  nonMemberSection: string;
  nonMemberDisplayName: string;
  nonMemberWhatsappNumber: string;
  nonMemberNationalIdLast4: string;
  nonMemberNotes: string;
  supportSection: string;
  guarantorMember: string;
  selectGuarantor: string;
  referrerMember: string;
  noReferrer: string;
  loanSection: string;
  principalAmount: string;
  termPeriods: string;
  originatedOn: string;
  purpose: string;
  submit: string;
};

export function LoanOriginationForm({
  activeMembers,
  clientRequestId,
  copy,
  errorMessage,
  guarantorMembers,
  today,
}: {
  activeMembers: MemberOption[];
  clientRequestId: string;
  copy: LoanCopy;
  errorMessage?: string;
  guarantorMembers: MemberOption[];
  today: string;
}) {
  const [borrowerKind, setBorrowerKind] = useState<"member" | "non_member">("member");
  const isNonMember = borrowerKind === "non_member";

  return (
    <form action={originateLoanAction} className="grid gap-5 rounded-md border border-border bg-surface p-5">
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      {errorMessage ? (
        <div className="rounded-md border border-error bg-surface p-3 text-sm text-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-lg font-semibold text-text-primary">{copy.borrowerSection}</legend>
        <FormField labelKey={copy.borrowerKind}>
          <Select
            name="borrowerKind"
            value={borrowerKind}
            onChange={(event) => setBorrowerKind(event.target.value as "member" | "non_member")}
            required
          >
            <option value="member">{copy.borrowerKindMember}</option>
            <option value="non_member">{copy.borrowerKindNonMember}</option>
          </Select>
        </FormField>

        {borrowerKind === "member" ? (
          <FormField labelKey={copy.borrowerMember}>
            <Select name="borrowerMemberId" defaultValue={activeMembers[0]?.id ?? ""} required>
              <option value="">{copy.selectMember}</option>
              {activeMembers.map((row) => (
                <option key={row.id} value={row.id}>{row.displayName}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </fieldset>

      {isNonMember ? (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-lg font-semibold text-text-primary">{copy.nonMemberSection}</legend>
          <FormField labelKey={copy.nonMemberDisplayName}>
            <InputText labelKey={copy.nonMemberDisplayName} name="nonMemberDisplayName" required />
          </FormField>
          <FormField labelKey={copy.nonMemberWhatsappNumber}>
            <InputText
              labelKey={copy.nonMemberWhatsappNumber}
              name="nonMemberWhatsappNumber"
              type="tel"
              placeholderKey="+593987654321"
            />
          </FormField>
          <FormField labelKey={copy.nonMemberNationalIdLast4}>
            <InputText
              labelKey={copy.nonMemberNationalIdLast4}
              name="nonMemberNationalIdLast4"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
            />
          </FormField>
          <FormField labelKey={copy.nonMemberNotes}>
            <InputText labelKey={copy.nonMemberNotes} name="nonMemberNotes" />
          </FormField>
        </fieldset>
      ) : null}

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-lg font-semibold text-text-primary">{copy.supportSection}</legend>
        {isNonMember ? (
          <FormField labelKey={copy.guarantorMember}>
            <Select name="guarantorMemberId" defaultValue="" required>
              <option value="">{copy.selectGuarantor}</option>
              {guarantorMembers.map((row) => (
                <option key={row.id} value={row.id}>{row.displayName}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
        <FormField labelKey={copy.referrerMember}>
          <Select name="referrerMemberId" defaultValue="">
            <option value="">{copy.noReferrer}</option>
            {activeMembers.map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-lg font-semibold text-text-primary">{copy.loanSection}</legend>
        <FormField labelKey={copy.principalAmount}>
          <InputNumber name="principalAmount" min="0.01" step="0.01" required />
        </FormField>
        <FormField labelKey={copy.termPeriods}>
          <InputNumber name="termPeriods" min="1" max="120" step="1" defaultValue={10} required />
        </FormField>
        <FormField labelKey={copy.originatedOn}>
          <InputText labelKey={copy.originatedOn} name="originatedOn" type="date" defaultValue={today} required />
        </FormField>
        <FormField labelKey={copy.purpose}>
          <InputText labelKey={copy.purpose} name="purpose" />
        </FormField>
      </fieldset>

      <div>
        <ButtonPrimary type="submit" labelKey={copy.submit} />
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { ButtonPrimary, FormField } from "@mi-banquito/ui";

type Copy = {
  reasonLabel: string;
  reasonHelp: string;
  submit: string;
};

export function ImpersonationStartForm({
  action,
  copy,
}: {
  action: (formData: FormData) => void | Promise<void>;
  copy: Copy;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 10;

  return (
    <form action={action} className="grid gap-5">
      <FormField labelKey={copy.reasonLabel} controlId="impersonation-reason" helperTextKey={copy.reasonHelp}>
        <textarea
          id="impersonation-reason"
          name="reason"
          className="min-h-32 w-full resize-y rounded-md border border-border bg-surface px-4 py-3 text-text-primary focus:border-primary focus:outline-none"
          minLength={10}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
      <ButtonPrimary type="submit" disabled={!valid}>{copy.submit}</ButtonPrimary>
    </form>
  );
}

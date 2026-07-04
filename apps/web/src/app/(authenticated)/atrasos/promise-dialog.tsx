"use client";

import { useRef } from "react";
import { ButtonPrimary, FormField, InputText } from "@mi-banquito/ui";
import type { DateOnlyString } from "@mi-banquito/domain";
import messages from "@/lib/i18n/en-US.json";
import type { markPromiseAction } from "./actions";

const copy = messages.atrasos;

type PromiseDialogAction = typeof markPromiseAction;

export type PromiseDialogProps = {
  action: PromiseDialogAction;
  memberId: string;
  loanId: string | null;
  cycleId: string | null;
  memberName: string;
  periodLabel: string;
  defaultPromisedOn: DateOnlyString;
  controlId: string;
};

export function PromiseDialog({
  action,
  memberId,
  loanId,
  cycleId,
  memberName,
  periodLabel,
  defaultPromisedOn,
  controlId,
}: PromiseDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${controlId}-title`;
  const dateId = `${controlId}-date`;
  const noteId = `${controlId}-note`;

  return (
    <>
      <ButtonPrimary
        type="button"
        labelKey={copy.markPromise}
        onClick={() => dialogRef.current?.showModal()}
      />
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-0 text-text-primary shadow-lg backdrop:bg-black/40"
      >
        <form action={action} className="grid gap-4 p-5">
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="loanId" value={loanId ?? ""} />
          <input type="hidden" name="cycleId" value={cycleId ?? ""} />
          <input type="hidden" name="periodLabel" value={periodLabel} />
          <header>
            <h2 id={titleId} className="text-lg font-semibold">{copy.markPromise}</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {memberName} · {periodLabel}
            </p>
          </header>
          <FormField labelKey={copy.promiseDate} controlId={dateId}>
            <InputText
              id={dateId}
              labelKey={copy.promiseDate}
              name="promisedOn"
              type="date"
              defaultValue={defaultPromisedOn}
              required
            />
          </FormField>
          <FormField labelKey={copy.promiseNote} controlId={noteId}>
            <InputText
              id={noteId}
              labelKey={copy.promiseNote}
              name="note"
              placeholderKey={copy.promiseNotePlaceholder}
            />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-surface px-4 font-semibold text-text-primary"
              onClick={() => dialogRef.current?.close()}
            >
              {copy.cancel}
            </button>
            <ButtonPrimary type="submit" labelKey={copy.savePromise} />
          </div>
        </form>
      </dialog>
    </>
  );
}

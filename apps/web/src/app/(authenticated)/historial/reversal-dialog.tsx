"use client";

import { useRef, useState } from "react";
import { reverseContributionAction } from "./actions";

export function ReversalDialog({
  contributionId,
  sentence,
  copy,
}: {
  contributionId: string;
  sentence: string;
  copy: { open: string; title: string; reason: string; cancel: string; confirm: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <button
        className="min-h-12 font-semibold text-error-text underline-offset-4 hover:underline"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {copy.open}
      </button>
      <dialog className="w-[min(32rem,calc(100%-2rem))] rounded-md border border-border bg-surface p-0 text-text-primary backdrop:bg-text-primary/40" ref={dialogRef}>
        <form action={reverseContributionAction} className="grid gap-4 p-5">
          <h2 className="text-xl font-semibold">{copy.title}</h2>
          <p>{sentence}</p>
          <input name="contributionId" type="hidden" value={contributionId} />
          <label className="grid gap-2 font-semibold" htmlFor={`reverse-reason-${contributionId}`}>
            {copy.reason}
            <textarea
              className="min-h-24 rounded-md border border-border bg-surface p-3 font-normal text-text-primary"
              id={`reverse-reason-${contributionId}`}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button className="min-h-12 px-4 font-semibold" onClick={() => dialogRef.current?.close()} type="button">
              {copy.cancel}
            </button>
            <button
              className="min-h-12 rounded-md bg-error-text px-4 font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!reason.trim()}
              type="submit"
            >
              {copy.confirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { AccountRow, AccountType } from "@mi-banquito/domain";
import { ButtonPrimary, ConfirmationModal, FormField, InputText, Select, StatusPill } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";

const copy = messages.accounts;

type SearchValue = string | string[] | undefined;
type AccountAction = (formData: FormData) => void | Promise<void>;

function valueOf(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function typeLabel(type: AccountType): string {
  return copy.types[type];
}

function feedback(search: Record<string, SearchValue>) {
  const errorCode = valueOf(search.error);
  const errors: Record<string, string> = {
    "invalid-form": copy.invalidForm,
    "name-required": copy.nameRequired,
    "last4-invalid": copy.last4Invalid,
    "account-not-found": copy.notFound,
    "idempotency-conflict": copy.idempotencyConflict,
    "action-failed": copy.actionFailed,
  };
  const saved = valueOf(search.saved);
  return {
    error: errors[errorCode],
    saved: saved === "created" ? copy.created : saved === "updated" ? copy.updated : undefined,
    archived: valueOf(search.archived) === "1" ? copy.archivedSuccess : undefined,
  };
}

export function AccountsRegistry({
  accounts,
  search,
  saveAction,
  archiveAction,
  saveClientRequestId,
}: {
  accounts: AccountRow[];
  search: Record<string, SearchValue>;
  saveAction: AccountAction;
  archiveAction: AccountAction;
  saveClientRequestId: string;
}) {
  const [archiveAccount, setArchiveAccount] = useState<AccountRow | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backgroundRef = useRef<HTMLElement>(null);
  const editId = valueOf(search.edit);
  const editing = accounts.find((row) => row.id === editId);
  const selectedType = editing?.type ?? "group_bank";
  const selectedGroupFundOverride = editing ? String(editing.isGroupFund) : "";
  const blocked = !accounts.some((row) => row.status === "active" && row.isGroupFund);
  const status = feedback(search);

  const closeArchive = useCallback(() => {
    const id = archiveAccount?.id;
    if (dialogRef.current?.open && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
    setArchiveAccount(null);
    if (id) requestAnimationFrame(() => document.getElementById(`archive-trigger-${id}`)?.focus());
  }, [archiveAccount]);

  useEffect(() => {
    if (!archiveAccount) return;
    const dialog = dialogRef.current;
    const background = backgroundRef.current;
    if (!dialog || !background) return;
    background.inert = true;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    confirmRef.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeArchive();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      background.inert = false;
    };
  }, [archiveAccount, closeArchive]);

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeArchive();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      : currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  return (
    <>
    <main ref={backgroundRef} className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6" data-screen="SCR-accounts">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.subtitle}</p>
      </header>

      {blocked ? (
        <section className="rounded-md border border-warning-text bg-warning-bg p-4 text-text-primary" data-testid="movement_blocked_banner" role="alert">
          <h2 className="font-semibold">{copy.blockedTitle}</h2>
          <p className="mt-1 text-sm">{copy.blockedDescription}</p>
        </section>
      ) : null}
      {status.error ? <p className="rounded-md border border-error-text bg-error-bg p-4 text-text-primary" role="alert">{status.error}</p> : null}
      {status.saved ? <p className="rounded-md border border-success bg-surface p-4 text-success" role="status">{status.saved}</p> : null}
      {status.archived ? <p className="rounded-md border border-success bg-surface p-4 text-success" role="status">{status.archived}</p> : null}

      <section className="flex flex-col gap-3" data-testid="accounts_table">
        <h2 className="text-lg font-semibold text-text-primary">{copy.tableTitle}</h2>
        {accounts.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-4 text-text-secondary">{copy.empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="min-w-[48rem] w-full text-left text-sm" aria-label={copy.tableTitle}>
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{copy.account}</th>
                  <th className="px-4 py-3 font-medium">{copy.type}</th>
                  <th className="px-4 py-3 font-medium">{copy.last4}</th>
                  <th className="px-4 py-3 font-medium">{copy.fundStatus}</th>
                  <th className="px-4 py-3 font-medium">{copy.recordStatus}</th>
                  <th className="px-4 py-3 font-medium">{copy.actions}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{row.name}</td>
                    <td className="px-4 py-3 text-text-primary">{typeLabel(row.type)}</td>
                    <td className="px-4 py-3 text-text-primary">{row.last4 ?? copy.notApplicable}</td>
                    <td className="px-4 py-3"><StatusPill kind={row.isGroupFund ? "success" : "error_text"} label={row.isGroupFund ? copy.inFund : copy.outsideFund} /></td>
                    <td className="px-4 py-3"><StatusPill kind={row.status === "active" ? "success" : "info_text"} label={row.status === "active" ? copy.active : copy.archived} /></td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-max flex-wrap items-center gap-2">
                        <Link className="inline-flex min-h-12 items-center rounded-md border border-primary px-4 font-semibold text-primary" href={`/cuentas?edit=${row.id}#form_account`} aria-label={copy.editAccount.replace("{{name}}", row.name)}>{copy.edit}</Link>
                        {row.status === "active" ? (
                          <button
                            id={`archive-trigger-${row.id}`}
                            type="button"
                            className="inline-flex min-h-12 items-center rounded-md bg-error-text px-4 font-semibold text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error-text"
                            aria-label={copy.archiveAccount.replace("{{name}}", row.name)}
                            onClick={() => setArchiveAccount(row)}
                          >
                            {copy.archive}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-info-text bg-info-bg p-4 text-text-primary" data-testid="fund_note">
        <h2 className="font-semibold">{copy.fundNoteTitle}</h2>
        <p className="mt-1 text-sm">{copy.fundNote}</p>
      </section>

      <section className="flex flex-col gap-3" data-testid="form_account" id="form_account">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{editing ? copy.editTitle : copy.createTitle}</h2>
          {editing ? <p className="mt-1 text-sm text-text-secondary">{editing.name}</p> : null}
        </div>
        <form action={saveAction} className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:p-5 md:grid-cols-2">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <input type="hidden" name="clientRequestId" value={saveClientRequestId} />
          <FormField labelKey={copy.name} controlId="account-name"><InputText id="account-name" name="name" labelKey={copy.name} defaultValue={editing?.name ?? ""} required /></FormField>
          <FormField labelKey={copy.type} controlId="account-type">
            <Select id="account-type" name="type" defaultValue={selectedType} required>
              <option value="group_bank">{copy.types.group_bank}</option><option value="cash_box">{copy.types.cash_box}</option><option value="treasurer_personal">{copy.types.treasurer_personal}</option><option value="external">{copy.types.external}</option>
            </Select>
          </FormField>
          <FormField labelKey={copy.last4Label} controlId="account-last4" helperTextKey={copy.last4Help}><InputText id="account-last4" name="last4" labelKey={copy.last4Label} defaultValue={editing?.last4 ?? ""} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" /></FormField>
          <FormField labelKey={copy.isGroupFund} controlId="account-is-group-fund" helperTextKey={copy.groupFundHelp}>
            <Select id="account-is-group-fund" name="isGroupFund" defaultValue={selectedGroupFundOverride}><option value="">{copy.groupFundByType}</option><option value="true">{copy.groupFundInside}</option><option value="false">{copy.groupFundOutside}</option></Select>
          </FormField>
          <div className="flex flex-wrap gap-3 md:col-span-2"><ButtonPrimary type="submit">{copy.save}</ButtonPrimary>{editing ? <Link className="inline-flex min-h-12 items-center rounded-md border border-primary px-4 font-semibold text-primary" href="/cuentas#form_account">{copy.cancel}</Link> : null}</div>
        </form>
      </section>

    </main>
      {archiveAccount ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="archive-dialog-title"
          className="fixed inset-0 m-auto w-full max-w-md border-0 bg-transparent p-0 backdrop:bg-text-primary/50"
          onKeyDown={trapDialogFocus}
        >
            <ConfirmationModal titleKey={copy.archiveAccount} bodyKey={copy.archiveConfirmBody} bodyValues={{ name: archiveAccount.name }} onConfirm={() => undefined} onCancel={closeArchive}>
              <div className="flex flex-col gap-4">
                <h2 id="archive-dialog-title" className="text-lg font-semibold text-text-primary">{copy.archiveAccount.replace("{{name}}", archiveAccount.name)}</h2>
                <p className="text-sm text-text-secondary">{copy.archiveConfirmBody}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={archiveAction}><input type="hidden" name="id" value={archiveAccount.id} /><button ref={confirmRef} type="submit" className="inline-flex min-h-12 items-center rounded-md bg-error-text px-4 font-semibold text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error-text">{copy.archiveConfirm}</button></form>
                  <button type="button" className="inline-flex min-h-12 items-center rounded-md border border-primary px-4 font-semibold text-primary" onClick={closeArchive}>{copy.cancelArchive}</button>
                </div>
              </div>
            </ConfirmationModal>
        </dialog>
      ) : null}
    </>
  );
}

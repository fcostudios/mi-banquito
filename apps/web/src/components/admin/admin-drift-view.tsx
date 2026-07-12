"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { PersistedDriftResult } from "@mi-banquito/domain";
import { StatusPill } from "@mi-banquito/ui";

import { ecDateTime } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import type { DriftRunnerDeploymentStatus } from "@/lib/drift/runner";

const copy = messages.adminDrift;

export function buildDriftImpTemplate(result: PersistedDriftResult): string {
  const report = result.rawText.endsWith("\n") ? result.rawText : `${result.rawText}\n`;
  return `${copy.impTemplateTitle}

## Detection
- Last checked: ${result.checkedAt.toISOString()}
- Exit code: ${result.exitCode}
- Runner: ${result.runnerKind}

## Problem statement
${copy.impProblem}

## Raw drift report
\`\`\`text
${report}\`\`\`

## Required outcome
- ${copy.impOutcomeReconcile}
- ${copy.impOutcomeRegression}
- ${copy.impOutcomeStrict}

## Verification
- ${copy.impVerifyClean}
- ${copy.impVerifyReport}
`;
}

function RunnerDeploymentIndicator({ deployment }: { deployment: DriftRunnerDeploymentStatus }) {
  const label = deployment.ready
    ? deployment.mode === "remote" ? copy.runnerRemoteReady : copy.runnerLocalReady
    : copy.runnerUnavailable;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-4" data-testid="runner_config">
      <StatusPill tone={deployment.ready ? "success" : "danger"} label={label} />
      <code className="text-xs text-text-secondary">{deployment.code}</code>
    </section>
  );
}

export function AdminDriftView({ result, runnerDeployment }: {
  result: PersistedDriftResult | undefined;
  runnerDeployment: DriftRunnerDeploymentStatus;
}) {
  const [tab, setTab] = useState<"summary" | "full">("full");
  const [impOpen, setImpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const summaryTabRef = useRef<HTMLButtonElement>(null);
  const fullTabRef = useRef<HTMLButtonElement>(null);
  const impTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef(false);
  useEffect(() => {
    if (impOpen) {
      restoreFocusRef.current = true;
      closeRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      impTriggerRef.current?.focus();
    }
  }, [impOpen]);
  if (!result) {
    return (
      <>
        <RunnerDeploymentIndicator deployment={runnerDeployment} />
        <p className="rounded-md border border-border bg-surface p-4 text-text-secondary">{copy.empty}</p>
      </>
    );
  }
  // Runner readiness is authoritative: a historical clean report cannot prove current safety.
  const historicalDrift = result.exitCode !== 0;
  const clean = runnerDeployment.ready && !historicalDrift;
  const statusLabel = !runnerDeployment.ready
    ? copy.runnerUnavailable
    : clean ? copy.noDrift : copy.driftDetected;
  const impTemplate = buildDriftImpTemplate(result);

  async function copyTemplate() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(impTemplate);
    } else {
      templateRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  }

  function selectTab(nextTab: "summary" | "full") {
    setTab(nextTab);
    (nextTab === "summary" ? summaryTabRef : fullTabRef).current?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tab === "summary" ? 0 : 1;
    let nextIndex: number | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + 2) % 2;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % 2;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(nextIndex === 0 ? "summary" : "full");
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setImpOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <RunnerDeploymentIndicator deployment={runnerDeployment} />
      <section className="rounded-md border border-border bg-surface p-4" data-testid="drift_badge">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={clean ? "success" : "danger"} label={statusLabel} />
          <p className="text-sm text-text-secondary">{copy.lastChecked}: {ecDateTime.format(result.checkedAt)}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-surface" data-testid="raw_report">
        <div className="flex border-b border-border bg-surface-muted p-1" role="tablist" aria-label={copy.reportTabs}>
          <button
            ref={summaryTabRef}
            id="drift-tab-summary"
            className="px-4 py-2 text-sm font-medium text-text-primary"
            type="button"
            role="tab"
            aria-selected={tab === "summary"}
            aria-controls="drift-panel-summary"
            tabIndex={tab === "summary" ? 0 : -1}
            onClick={() => selectTab("summary")}
            onKeyDown={handleTabKeyDown}
          >
            {copy.summary}
          </button>
          <button
            ref={fullTabRef}
            id="drift-tab-full"
            className="px-4 py-2 text-sm font-medium text-text-primary"
            type="button"
            role="tab"
            aria-selected={tab === "full"}
            aria-controls="drift-panel-full"
            tabIndex={tab === "full" ? 0 : -1}
            onClick={() => selectTab("full")}
            onKeyDown={handleTabKeyDown}
          >
            {copy.fullReport}
          </button>
        </div>
        <div
          id="drift-panel-summary"
          role="tabpanel"
          aria-labelledby="drift-tab-summary"
          hidden={tab !== "summary"}
        >
          <p className="p-4 text-sm text-text-secondary">{copy.exitCodeSummary.replace("{{code}}", String(result.exitCode))}</p>
        </div>
        <div
          id="drift-panel-full"
          role="tabpanel"
          aria-labelledby="drift-tab-full"
          hidden={tab !== "full"}
        >
          <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-text-primary" data-testid="raw-report">
            {result.rawText}
          </pre>
        </div>
      </section>

      {historicalDrift ? (
        <section className="flex justify-end" data-testid="file_imp">
          <button
            ref={impTriggerRef}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-text-on-primary"
            type="button"
            onClick={() => {
              setCopied(false);
              setImpOpen(true);
            }}
          >
            {copy.fileImp}
          </button>
        </section>
      ) : null}

      {impOpen ? (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="imp-dialog-title"
          onKeyDown={handleDialogKeyDown}
        >
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-4 rounded-md border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-text-primary" id="imp-dialog-title">{copy.impDialogTitle}</h2>
              <button ref={closeRef} className="text-sm font-medium text-primary" type="button" onClick={() => setImpOpen(false)}>
                {copy.close}
              </button>
            </div>
            <textarea
              ref={templateRef}
              className="min-h-80 w-full resize-y rounded-md border border-border bg-surface-muted p-3 font-mono text-xs text-text-primary"
              aria-label={copy.impTemplateLabel}
              readOnly
              value={impTemplate}
            />
            <div className="flex items-center justify-end gap-3">
              {copied ? <p className="text-sm text-text-secondary" role="status">{copy.copied}</p> : null}
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-text-on-primary"
                type="button"
                onClick={copyTemplate}
              >
                {copy.copyTemplate}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

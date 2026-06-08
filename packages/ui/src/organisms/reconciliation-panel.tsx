// organism.reconciliation-panel — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: ReconciliationCycle, PeriodClose. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface ReconciliationPanelProps {
  items: unknown[];
  className?: string;
}

export function ReconciliationPanel(_props: ReconciliationPanelProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="reconciliation-panel"
    />
  );
}

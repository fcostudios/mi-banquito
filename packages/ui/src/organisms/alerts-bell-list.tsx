// organism.alerts-bell-list — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: Alert. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface AlertsBellListProps {
  items: unknown[];
  className?: string;
}

export function AlertsBellList(_props: AlertsBellListProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="alerts-bell-list"
    />
  );
}

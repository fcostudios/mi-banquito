// organism.ar-aging-list — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: member_compliance_state, Loan_in_arrears. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface ArAgingListProps {
  items: unknown[];
  className?: string;
}

export function ArAgingList(_props: ArAgingListProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="ar-aging-list"
    />
  );
}

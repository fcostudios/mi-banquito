// organism.loan-card — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: Loan, LoanSchedule, Repayment, InterestAccrual. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface LoanCardProps {
  items: unknown[];
  className?: string;
}

export function LoanCard(_props: LoanCardProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="loan-card"
    />
  );
}

// molecule.loan-row — molecule (IMP-251). RENDERED list row; text via props, token
// colors. Final per-entity columns are the dev team's from Step-7 mocks.
import { type ReactNode } from "react";

export interface LoanRowProps {
  primaryText: string;
  trailing?: ReactNode;
  onClick?: () => void;
}

export function LoanRow({ primaryText, trailing, onClick }: LoanRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-border min-h-12 px-2 text-text-primary"
      onClick={onClick}
    >
      <span>{primaryText}</span>
      {trailing}
    </div>
  );
}

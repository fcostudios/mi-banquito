// molecule.member-row — molecule (IMP-251). RENDERED list row; text via props, token
// colors. Final per-entity columns are the dev team's from Step-7 mocks.
import { type ReactNode } from "react";

export interface MemberRowProps {
  primaryText: string;
  trailing?: ReactNode;
  onClick?: () => void;
}

export function MemberRow({ primaryText, trailing, onClick }: MemberRowProps) {
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

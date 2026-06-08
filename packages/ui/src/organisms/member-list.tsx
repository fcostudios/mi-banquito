// organism.member-list — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: Member. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface MemberListProps {
  items: unknown[];
  className?: string;
}

export function MemberList(_props: MemberListProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="member-list"
    />
  );
}

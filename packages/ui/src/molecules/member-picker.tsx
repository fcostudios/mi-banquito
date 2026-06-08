// molecule.member-picker — molecule (IMP-251). TYPED DoR STUB (needs mock layout (spec signal: 'search') — typed DoR stub). Real prop
// interface + token wiring; the dev team builds the interactive layout
// from the Step-7 mocks. NOT an empty placeholder.
export interface MemberPickerProps {
  org_id: string;
  onSelect: (...args: unknown[]) => void;
  excludeIds?: unknown[];
  roleFilter?: 'aportante';
}

export function MemberPicker(_props: MemberPickerProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 text-text-secondary" data-molecule="member-picker" />
  );
}

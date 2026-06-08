// atom.tag — atom (IMP-251). Neutral tag/chip; label via prop. (Status chips
// route through the status-pill SSOT atom, NOT this.)
export interface TagProps {
  label?: string;
}

export function Tag({ label }: TagProps) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-muted text-text-secondary px-2">
      {label}
    </span>
  );
}

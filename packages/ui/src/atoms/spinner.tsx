// atom.spinner — atom (IMP-251). Spinner with a SPECIFIC loading label (a11y;
// never a bare spinner) — the label arrives via the labelKey prop.
export interface SpinnerProps {
  labelKey?: string;
}

export function Spinner({ labelKey }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-text-secondary">
      <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span>{labelKey}</span>
    </span>
  );
}

// status-pill — SSOT atom for status colors (IMP-241).
// The ONLY component allowed to render the semantic hexes: #FECACA #B91C1C #FDE68A #B45309 #15803D #FED7AA #C2410C
import "./status-pill.css";

export type StatusKind = 'error_bg' | 'error_text' | 'info_bg' | 'info_text' | 'success' | 'warning_bg' | 'warning_text';

export interface StatusPillProps {
  kind: StatusKind;
  /** Text label — status is NEVER color-only (a11y baseline). */
  label: string;
}

export function StatusPill({ kind, label }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${kind.replace(/_/g, "-")}`}>
      {label}
    </span>
  );
}

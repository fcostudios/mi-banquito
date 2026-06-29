// status-pill — SSOT atom for status colors (IMP-241).
// The ONLY component allowed to render the semantic hexes: #FECACA #B91C1C #FDE68A #B45309 #15803D #FED7AA #C2410C
import "./status-pill.css";

export type StatusKind = 'error_bg' | 'error_text' | 'info_bg' | 'info_text' | 'success' | 'warning_bg' | 'warning_text';
export type StatusPillTone = "success" | "warning" | "danger" | "neutral";

export interface StatusPillProps {
  kind?: StatusKind;
  tone?: StatusPillTone;
  /** Text label — status is NEVER color-only (a11y baseline). */
  label: string;
}

function toneToKind(tone: StatusPillTone): StatusKind {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning_bg";
  if (tone === "danger") return "error_bg";
  return "info_bg";
}

export function StatusPill({ kind, tone, label }: StatusPillProps) {
  const resolvedKind = kind ?? toneToKind(tone ?? "neutral");
  return (
    <span className={`status-pill status-pill--${resolvedKind.replace(/_/g, "-")}`} data-component="status-pill">
      {label}
    </span>
  );
}

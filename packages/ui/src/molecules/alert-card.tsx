// molecule.alert-card — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface AlertCardProps {
  alert: unknown;
  onDismiss: () => void;
  onSnooze: () => void;
  onAct: () => void;
  children?: ReactNode;
}

export function AlertCard({ children }: AlertCardProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="alert-card">
      {children}
    </div>
  );
}

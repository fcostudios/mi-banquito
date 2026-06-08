// molecule.confirmation-modal — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface ConfirmationModalProps {
  titleKey: string;
  bodyKey: string;
  bodyValues: unknown;
  requireReason?: boolean;
  onConfirm: (...args: unknown[]) => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmationModal({ children }: ConfirmationModalProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="confirmation-modal">
      {children}
    </div>
  );
}

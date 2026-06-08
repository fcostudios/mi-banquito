// molecule.success-feedback — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface SuccessFeedbackProps {
  labelKey?: string;
  children?: ReactNode;
}

export function SuccessFeedback({ labelKey, children }: SuccessFeedbackProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="success-feedback">
      {labelKey ? <span className="text-text-primary">{labelKey}</span> : null}
      {children}
    </div>
  );
}

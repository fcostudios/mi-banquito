// molecule.empty-state — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface EmptyStateProps {
  illustration?: string;
  headingKey: string;
  ctaLabelKey?: string;
  onCtaPress?: () => void;
  children?: ReactNode;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="empty-state">
      {children}
    </div>
  );
}

// molecule.currency-input — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface CurrencyInputProps {
  value: string;
  onChange: () => void;
  children?: ReactNode;
}

export function CurrencyInput({ children }: CurrencyInputProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="currency-input">
      {children}
    </div>
  );
}

// molecule.date-picker — molecule (IMP-251). RENDERED token-wired container; label via
// prop, children from the consumer. Detailed layout from Step-7 mocks.
import { type ReactNode } from "react";

export interface DatePickerProps {
  labelKey?: string;
  children?: ReactNode;
}

export function DatePicker({ labelKey, children }: DatePickerProps) {
  return (
    <div className="rounded-md bg-surface p-4 text-text-primary" data-molecule="date-picker">
      {labelKey ? <span className="text-text-primary">{labelKey}</span> : null}
      {children}
    </div>
  );
}

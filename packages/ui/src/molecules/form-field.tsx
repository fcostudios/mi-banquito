// molecule.form-field — molecule (IMP-251). RENDERED: label + control slot + helper +
// error. Text via *Key props (consumer useLocale); colors via tokens.
import { type ReactNode } from "react";

export interface FormFieldProps {
  labelKey: string;
  helperTextKey?: string;
  errorMessageKey?: string;
  children: ReactNode;
}

export function FormField({ labelKey, helperTextKey, errorMessageKey, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-text-primary">{labelKey}</label>
      {children}
      {helperTextKey ? <span className="text-text-secondary">{helperTextKey}</span> : null}
      {errorMessageKey ? <span className="text-error">{errorMessageKey}</span> : null}
    </div>
  );
}

// atom.input.text — atom (IMP-251). Token-driven field; the form-field molecule
// renders the label, so the bare atom carries no JSX text node.
import { type InputHTMLAttributes } from "react";

export interface InputTextProps extends InputHTMLAttributes<HTMLInputElement> {
  labelKey: string;
  placeholderKey?: string;
  helperTextKey?: string;
  errorMessageKey?: string;
}

export function InputText({ placeholderKey, ...rest }: InputTextProps) {
  return (
    <input
      type="text"
      className="bg-surface text-text-primary border border-border rounded-md px-4 min-h-12 w-full focus:border-primary"
      placeholder={placeholderKey}
      {...rest}
    />
  );
}

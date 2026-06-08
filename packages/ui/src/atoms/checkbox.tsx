// atom.checkbox — atom (IMP-251). Checkbox toggle; text via the label prop.
import { type InputHTMLAttributes } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-text-primary min-h-12">
      <input type="checkbox" className="accent-primary" {...rest} />
      <span>{label}</span>
    </label>
  );
}

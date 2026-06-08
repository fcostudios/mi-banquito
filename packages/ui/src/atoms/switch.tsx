// atom.switch — atom (IMP-251). Checkbox toggle; text via the label prop.
import { type InputHTMLAttributes } from "react";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Switch({ label, ...rest }: SwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 text-text-primary min-h-12">
      <input type="checkbox" role="switch" className="accent-primary" {...rest} />
      <span>{label}</span>
    </label>
  );
}

// atom.radio — atom (IMP-251). Radio toggle; text via the label prop.
import { type InputHTMLAttributes } from "react";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Radio({ label, ...rest }: RadioProps) {
  return (
    <label className="inline-flex items-center gap-2 text-text-primary min-h-12">
      <input type="radio" className="accent-primary" {...rest} />
      <span>{label}</span>
    </label>
  );
}

// atom.input.number — atom (IMP-251). Token-driven field; the form-field molecule
// renders the label, so the bare atom carries no JSX text node.
import { type InputHTMLAttributes } from "react";

export interface InputNumberProps extends InputHTMLAttributes<HTMLInputElement> {

}

export function InputNumber({ ...rest }: InputNumberProps) {
  return (
    <input
      type="number"
      className="bg-surface text-text-primary border border-border rounded-md px-4 min-h-12 w-full focus:border-primary"
      {...rest}
    />
  );
}

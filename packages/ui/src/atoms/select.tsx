// atom.select — atom (IMP-251). Native <select> on the design tokens; <option>
// children supplied by the consumer (no bare text here).
import { type SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ children, ...rest }: SelectProps) {
  return (
    <select
      className="bg-surface text-text-primary border border-border rounded-md px-4 min-h-12 w-full focus:border-primary"
      {...rest}
    >
      {children}
    </select>
  );
}

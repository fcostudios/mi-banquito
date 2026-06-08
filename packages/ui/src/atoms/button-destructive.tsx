// atom.button.destructive — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes } from "react";

export interface ButtonDestructiveProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label?: string;
}

/** bg-error text-surface → colors from the data-driven Tailwind token preset. */
export function ButtonDestructive({ label, ...rest }: ButtonDestructiveProps) {
  return (
    <button
      type="button"
      className="bg-error text-surface rounded-md px-4 min-h-12 inline-flex items-center gap-2"
      {...rest}
    >
      {label}
    </button>
  );
}

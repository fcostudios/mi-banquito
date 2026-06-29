// atom.button.destructive — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export interface ButtonDestructiveProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  children?: ReactNode;
}

/** bg-error text-surface → colors from the data-driven Tailwind token preset. */
export function ButtonDestructive({ label, children, type = "button", ...rest }: ButtonDestructiveProps) {
  return (
    <button
      type={type}
      className="bg-error text-surface rounded-md px-4 min-h-12 inline-flex items-center gap-2"
      {...rest}
    >
      {children ?? label}
    </button>
  );
}

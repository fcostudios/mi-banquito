// atom.button.secondary — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export interface ButtonSecondaryProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  labelKey?: string;
  children?: ReactNode;
}

/** bg-surface text-primary border border-primary → colors from the data-driven Tailwind token preset. */
export function ButtonSecondary({ label, labelKey, children, type = "button", ...rest }: ButtonSecondaryProps) {
  return (
    <button
      type={type}
      className="bg-surface text-primary border border-primary rounded-md px-4 min-h-12 inline-flex items-center gap-2"
      {...rest}
    >
      {children ?? label ?? labelKey}
    </button>
  );
}

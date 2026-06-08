// atom.button.secondary — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes } from "react";

export interface ButtonSecondaryProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label?: string;
}

/** bg-surface text-primary border border-primary → colors from the data-driven Tailwind token preset. */
export function ButtonSecondary({ label, ...rest }: ButtonSecondaryProps) {
  return (
    <button
      type="button"
      className="bg-surface text-primary border border-primary rounded-md px-4 min-h-12 inline-flex items-center gap-2"
      {...rest}
    >
      {label}
    </button>
  );
}

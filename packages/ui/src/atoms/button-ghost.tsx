// atom.button.ghost — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes } from "react";

export interface ButtonGhostProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label?: string;
}

/** bg-transparent text-primary → colors from the data-driven Tailwind token preset. */
export function ButtonGhost({ label, ...rest }: ButtonGhostProps) {
  return (
    <button
      type="button"
      className="bg-transparent text-primary rounded-md px-4 min-h-12 inline-flex items-center gap-2"
      {...rest}
    >
      {label}
    </button>
  );
}

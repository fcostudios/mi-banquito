// atom.icon-button — atom (IMP-251). Icon-only (icon as prop); aria-label required (a11y).
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> {
  icon: ReactNode;
  ariaLabel: string;
}

export function IconButton({ icon, ariaLabel, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="bg-transparent text-primary inline-flex items-center justify-center min-h-12 min-w-12 rounded-md"
      {...rest}
    >
      {icon}
    </button>
  );
}

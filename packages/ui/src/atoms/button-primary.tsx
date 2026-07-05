// atom.button.primary — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export interface ButtonPrimaryProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  labelKey?: string;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  onPress?: () => void;
}

/** bg-primary text-text-on-primary → colors from the data-driven Tailwind token preset. */
export function ButtonPrimary({ labelKey, children, icon, loading, disabled, onPress, onClick, type = "button", ...rest }: ButtonPrimaryProps) {
  return (
    <button
      type={type}
      className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-4 font-semibold text-text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
      aria-busy={loading ?? undefined}
      disabled={disabled}
      onClick={onPress ?? onClick}
      {...rest}
    >
      {icon}
      {children ?? labelKey}
    </button>
  );
}

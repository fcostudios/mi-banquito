// atom.button.primary — atom (IMP-251). Token-driven; label via prop (consumer useLocale).
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export interface ButtonPrimaryProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  labelKey?: string;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  onPress?: () => void;
}

/** bg-primary text-surface → colors from the data-driven Tailwind token preset. */
export function ButtonPrimary({ labelKey, children, icon, loading, disabled, onPress, onClick, type = "button", ...rest }: ButtonPrimaryProps) {
  return (
    <button
      type={type}
      className="bg-primary text-surface rounded-md px-4 min-h-12 inline-flex items-center gap-2"
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

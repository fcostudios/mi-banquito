// atom.divider — atom (IMP-251). Horizontal rule on the border token.
export interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return <hr className={`border-border ${className ?? ""}`} />;
}

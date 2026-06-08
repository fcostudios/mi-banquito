// atom.link — atom (IMP-251). Inline link; label via the label prop.
import { type AnchorHTMLAttributes } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  label?: string;
}

export function Link({ label, href, ...rest }: LinkProps) {
  return (
    <a href={href} className="text-primary underline" {...rest}>
      {label}
    </a>
  );
}

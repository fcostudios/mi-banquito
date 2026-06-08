// atom.avatar — atom (IMP-251). Avatar; falls back to initials (text via prop).
export interface AvatarProps {
  src?: string;
  alt: string;
  initials?: string;
}

export function Avatar({ src, alt, initials }: AvatarProps) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-surface-muted text-text-primary min-h-12 min-w-12 overflow-hidden">
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" /> : <span>{initials}</span>}
    </span>
  );
}

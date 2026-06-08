// organism.sidebar — organism (IMP-251). REAL typed prop interface + token wiring.
// Data bindings: —. Final layout is a Step-7-mock DoR boundary —
// the dev team composes the atoms/molecules into the screen here.
export interface SidebarProps {
  className?: string;
}

export function Sidebar(_props: SidebarProps) {
  return (
    <section
      className="rounded-md bg-surface text-text-primary"
      data-organism="sidebar"
    />
  );
}

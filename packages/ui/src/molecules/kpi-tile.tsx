// molecule.kpi-tile — molecule (IMP-251). RENDERED metric tile; label/hint via props.
export interface KpiTileProps {
  labelKey: string;
  value: string;
  hintKey?: string;
}

export function KpiTile({ labelKey, value, hintKey }: KpiTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface p-4">
      <span className="text-text-secondary">{labelKey}</span>
      <span className="text-text-primary text-2xl">{value}</span>
      {hintKey ? <span className="text-text-secondary">{hintKey}</span> : null}
    </div>
  );
}

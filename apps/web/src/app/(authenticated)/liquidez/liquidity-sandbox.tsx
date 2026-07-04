"use client";

import { useMemo, useState } from "react";
import { InputNumber } from "@mi-banquito/ui";
import { applyHypotheticalLoan, liquidityNarrative, type LiquidityPoint } from "@mi-banquito/domain";

type LiquiditySandboxCopy = {
  amount: string;
  projection: string;
  title: string;
};

function formatMoney(value: string): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function projectionPath(series: LiquidityPoint[]): string {
  if (series.length === 0) {
    return "";
  }
  const balances = series.map((row) => Number(row.projectedBalance));
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  return series.map((row, index) => {
    const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
    const y = 90 - ((Number(row.projectedBalance) - min) / range) * 70;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function ProjectionChart({ series }: { series: LiquidityPoint[] }) {
  const path = projectionPath(series);

  return (
    <div className="rounded-md bg-surface-muted p-3">
      <svg className="h-48 w-full text-primary" role="img" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
    </div>
  );
}

export function LiquiditySandbox({
  commitment,
  copy,
  series,
}: {
  commitment: string;
  copy: LiquiditySandboxCopy;
  series: LiquidityPoint[];
}) {
  const [amount, setAmount] = useState("");
  const shifted = useMemo(() => applyHypotheticalLoan(series, amount), [amount, series]);
  const narrative = useMemo(() => liquidityNarrative({ series: shifted, commitment }), [commitment, shifted]);

  return (
    <section aria-label={copy.title} className="grid gap-4 rounded-md border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold text-text-primary">{copy.title}</h2>
      <label className="grid gap-2 text-sm font-medium text-text-primary">
        <span>{copy.amount}</span>
        <InputNumber
          aria-label={copy.amount}
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <p className="text-sm text-text-secondary">{narrative}</p>
      <ProjectionChart series={shifted} />
      <div className="grid gap-2" aria-label={copy.projection}>
        {shifted.map((row) => (
          <div key={row.monthOn} className="grid grid-cols-[1fr_auto] rounded-md bg-surface-muted p-3 text-sm">
            <span>{row.monthOn}</span>
            <strong>{formatMoney(row.projectedBalance)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

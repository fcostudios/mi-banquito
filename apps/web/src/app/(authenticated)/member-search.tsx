"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type MemberSearchRow = {
  memberId: string;
  displayName: string;
  currentBalance: string;
};

export function MemberSearch({
  rows,
  labels,
}: {
  rows: MemberSearchRow[];
  labels: { search: string; empty: string; title: string };
}) {
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? rows.filter((row) => row.displayName.toLowerCase().includes(normalized))
      : rows;
    return matches.slice(0, normalized ? 8 : 5);
  }, [query, rows]);

  return (
    <section className="grid gap-3 rounded-md border border-border bg-surface p-4" aria-label={labels.title}>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-text-primary">{labels.title}</span>
        <input
          className="min-h-12 rounded-md border border-border bg-surface px-4 text-text-primary"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={labels.search}
        />
      </label>
      <div className="grid">
        {visibleRows.length === 0 ? (
          <p className="text-sm text-text-secondary">{labels.empty}</p>
        ) : visibleRows.map((row) => (
          <Link
            key={row.memberId}
            href={`/socias/${row.memberId}`}
            className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
          >
            <span className="min-w-0 truncate font-medium text-text-primary">{row.displayName}</span>
            <span className="font-mono text-sm text-text-secondary">USD {Number(row.currentBalance).toFixed(2)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

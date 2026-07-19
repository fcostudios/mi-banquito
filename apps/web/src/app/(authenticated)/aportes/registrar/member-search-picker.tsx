"use client";

import { useMemo, useState } from "react";

type MemberOption = { id: string; displayName: string };

export function MemberSearchPicker({
  defaultMemberId,
  members,
  copy,
}: {
  defaultMemberId?: string;
  members: MemberOption[];
  copy: { search: string; placeholder: string; member: string; empty: string };
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("es-EC");
  const filtered = useMemo(
    () => members.filter((member) => member.displayName.toLocaleLowerCase("es-EC").includes(normalizedQuery)),
    [members, normalizedQuery],
  );

  return (
    <div className="grid gap-2">
      <label className="text-sm font-semibold text-text-primary" htmlFor="contribution-member-search">
        {copy.search}
      </label>
      <input
        className="min-h-12 w-full rounded-md border border-border bg-surface px-4 text-text-primary"
        id="contribution-member-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={copy.placeholder}
        type="search"
        value={query}
      />
      <label className="text-sm font-semibold text-text-primary" htmlFor="contribution-member">
        {copy.member}
      </label>
      <select
        className="min-h-12 w-full rounded-md border border-border bg-surface px-4 text-text-primary"
        defaultValue={defaultMemberId}
        id="contribution-member"
        name="memberId"
        required
      >
        {filtered.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
      </select>
      {filtered.length === 0 ? <p className="text-sm text-text-secondary">{copy.empty}</p> : null}
    </div>
  );
}

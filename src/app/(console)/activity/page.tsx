"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, FilterBar, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { formatWhen } from "@/lib/format";

type Entry = {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetLabel: string;
  detail: string;
  createdAt: string;
};

const filters = [
  { id: "all", label: "All" },
  { id: "user", label: "Accounts" },
  { id: "workspace", label: "Workspaces" },
  { id: "gpu", label: "GPU" },
];

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ activity: Entry[] }>("/api/activity?limit=100")
      .then((data) => setEntries(data.activity))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load activity"));
  }, []);

  const visible = useMemo(() => {
    return entries.filter((entry) => {
      const haystack = `${entry.actorName} ${entry.detail} ${entry.targetLabel} ${entry.action}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (filter === "user") return entry.targetType === "user" || entry.action.startsWith("auth");
      if (filter === "workspace") return entry.targetType === "workspace";
      if (filter === "gpu") return entry.action.startsWith("gpu") || entry.targetType === "gpu" || entry.targetType === "job";
      return true;
    });
  }, [entries, query, filter]);

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="A record of account, workspace, and GPU changes." />
      {error ? <p className="mb-4 text-sm text-[#9f1c1c]">{error}</p> : null}
      <FilterBar query={query} onQuery={setQuery} placeholder="Search activity..." filters={filters} active={filter} onFilter={setFilter} />
      {visible.length === 0 ? (
        <EmptyState title="No activity" body="Creates, access changes, container updates, and GPU assignments show up here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e6e8ee] bg-white shadow-card">
          {visible.map((entry) => (
            <article key={entry.id} className="grid gap-2 border-b border-[#f1f3f6] px-5 py-4 last:border-b-0 md:grid-cols-[160px_1fr]">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8b9098]">{formatWhen(entry.createdAt)}</p>
              <div>
                <p className="text-sm font-semibold text-[#17181c]">{entry.actorName}</p>
                <p className="mt-1 text-sm leading-6 text-[#4b5160]">{entry.detail}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkspaceCard, type WorkspaceCardData } from "@/components/workspace-card";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/client";
import { formatRam, formatWhen } from "@/lib/format";

type Dashboard = {
  stats: { workspaces: number; running: number; users: number; queued: number; gpus: number; busy: number };
  workspaces: WorkspaceCardData[];
  gpus: { id: string; name: string; index: number; status: string; memoryMb: number; workspace: { name: string } | null }[];
  jobs: { id: string; title: string; status: string; position: number | null; workspace: { name: string } }[];
  activity: { id: string; actorName: string; detail: string; createdAt: string }[];
};

const stats = [
  { key: "workspaces", label: "Workspaces" },
  { key: "running", label: "Running" },
  { key: "users", label: "Accounts" },
  { key: "queued", label: "GPU queue" },
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const next = await api<Dashboard>("/api/dashboard");
        if (alive) {
          setData(next);
          setError("");
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load the dashboard");
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Capacity, workspace containers, and the GPU queue at a glance."
        action={
          <Link href="/workspaces" className="inline-flex items-center rounded-xl bg-[#00968a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#007f76]">
            View workspaces
          </Link>
        }
      />
      {error ? <p className="mb-4 text-sm text-[#9f1c1c]">{error}</p> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.key} className="rounded-2xl border border-[#e6e8ee] bg-white px-5 py-4 shadow-card">
            <p className="text-sm text-[#8b9098]">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#17181c]">{data ? data.stats[item.key] : "–"}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">GPU pool</h2>
            <p className="text-sm text-[#8b9098]">
              {data ? `${data.stats.busy} of ${data.stats.gpus} in use` : "Loading scheduler"}
            </p>
          </div>
          <Link href="/scheduler" className="text-sm font-semibold text-[#00968a]">
            Open scheduler
          </Link>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef1f4]">
          <div
            className="h-full rounded-full bg-[#00968a]"
            style={{ width: data && data.stats.gpus ? `${(data.stats.busy / data.stats.gpus) * 100}%` : "0%" }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(data?.gpus || []).map((gpu) => (
            <span key={gpu.id} className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#4b5160]">
              GPU {gpu.index} · {gpu.status === "BUSY" ? gpu.workspace?.name || "busy" : "free"} · {formatRam(gpu.memoryMb)}
            </span>
          ))}
        </div>
      </section>

      <div className="mt-6 flex items-end justify-between">
        <h2 className="text-base font-semibold">Workspaces</h2>
        <Link href="/workspaces" className="text-sm font-semibold text-[#00968a]">
          Manage all
        </Link>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.workspaces || []).map((workspace) => (
          <WorkspaceCard key={workspace.id} workspace={workspace} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card">
          <h2 className="text-base font-semibold">Queue</h2>
          <div className="mt-3 space-y-3">
            {(data?.jobs || []).length === 0 ? <p className="text-sm text-[#8b9098]">No GPU jobs are waiting.</p> : null}
            {(data?.jobs || []).map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f8fa] px-3 py-3">
                <div>
                  <p className="text-sm font-medium">{job.title}</p>
                  <p className="text-xs text-[#8b9098]">{job.workspace.name}</p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-[#0f766e]">
                  {job.status === "QUEUED" ? `Queue ${job.position}` : job.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <div className="mt-3 space-y-3">
            {(data?.activity || []).map((entry) => (
              <div key={entry.id}>
                <p className="text-sm text-[#17181c]">
                  <span className="font-medium">{entry.actorName}</span> · {entry.detail}
                </p>
                <p className="text-xs text-[#8b9098]">{formatWhen(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

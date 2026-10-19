import Link from "next/link";
import { WorkspaceIcon } from "@/components/icons";
import { formatCpu, formatRam } from "@/lib/format";

export type WorkspaceCardData = {
  id: string;
  name: string;
  description: string;
  cpu: number;
  memoryMb: number;
  status: string;
  gpuMode: string;
  prompt: string;
  owner: { username: string; name: string } | null;
  activeJob: { title: string; status: string } | null;
};

const statusLabel: Record<string, string> = {
  RUNNING: "running",
  STOPPED: "stopped",
  PROVISIONING: "provisioning",
  ERROR: "error",
};

export function WorkspaceCard({ workspace }: { workspace: WorkspaceCardData }) {
  const gpu = workspace.gpuMode !== "NONE";
  const label = gpu ? "gpu" : statusLabel[workspace.status] || workspace.status.toLowerCase();
  const dot = gpu ? "bg-[#00968a]" : workspace.status === "RUNNING" ? "bg-[#17a34a]" : workspace.status === "ERROR" ? "bg-[#e11d48]" : "bg-[#a1a1aa]";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card transition hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef4ff] text-[#3b82f6]">
          <WorkspaceIcon className="h-5 w-5" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#667085]">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {label}
        </span>
      </div>
      <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-[#17181c]">{workspace.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#8b9098]">{workspace.description}</p>
      <p className="mt-3 text-sm text-[#667085]">
        {formatCpu(workspace.cpu)} · {formatRam(workspace.memoryMb)}
      </p>
      <p className="mt-1 truncate font-mono text-[13px] text-[#0f766e]">{workspace.prompt}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-[#8b9098]">Owner</span>
        <span className="rounded-lg bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#4b5160]">
          {workspace.owner?.username || "Unassigned"}
        </span>
      </div>
      {workspace.activeJob ? (
        <p className="mt-3 truncate text-xs text-[#8b9098]">
          {workspace.activeJob.status === "RUNNING" ? "GPU job running" : "Waiting for a GPU"} · {workspace.activeJob.title}
        </p>
      ) : null}
      <Link
        href={`/workspaces/${workspace.id}`}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#00968a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f76]"
        style={{ marginTop: workspace.activeJob ? "0.9rem" : "1.15rem" }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="m7 9 3 2.5L7 14M12 14h5" />
        </svg>
        Open Workspace
      </Link>
    </article>
  );
}

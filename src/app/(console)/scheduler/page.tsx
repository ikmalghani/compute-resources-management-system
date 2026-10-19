"use client";

import { useEffect, useMemo, useState } from "react";
import { GpuIcon, PlusIcon } from "@/components/icons";
import { Banner, DangerButton, EmptyState, Field, FilterBar, Modal, PageHeader, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";
import { formatRam, formatWhen } from "@/lib/format";

type Gpu = {
  id: string;
  index: number;
  name: string;
  memoryMb: number;
  status: "FREE" | "BUSY";
  workspace: { id: string; name: string; slug: string; gpuMode: string } | null;
};
type Job = {
  id: string;
  title: string;
  command: string;
  output: string;
  status: string;
  error: string | null;
  position: number | null;
  workspace: { id: string; name: string; gpuMode: string };
  requestedBy: { username: string } | null;
  createdAt: string;
};
type Workspace = { id: string; name: string; status: string };
type Me = { role: "ADMIN" | "USER" };

const filters = [
  { id: "active", label: "Active" },
  { id: "queued", label: "Queued" },
  { id: "running", label: "Running" },
  { id: "all", label: "All" },
];

export default function SchedulerPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const [jobForm, setJobForm] = useState({ workspaceId: "", title: "", command: "nvidia-smi" });
  const [gpuForm, setGpuForm] = useState({ name: "", memoryMb: 16384, index: "" });

  async function load() {
    const [session, pool, spaces] = await Promise.all([
      api<{ user: Me }>("/api/auth/me"),
      api<{ gpus: Gpu[]; jobs: Job[] }>("/api/gpu"),
      api<{ workspaces: Workspace[] }>("/api/workspaces"),
    ]);
    setMe(session.user);
    setGpus(pool.gpus);
    setJobs(pool.jobs);
    const running = spaces.workspaces.filter((workspace) => workspace.status === "RUNNING");
    setWorkspaces(running);
    setJobForm((current) => ({ ...current, workspaceId: current.workspaceId || running[0]?.id || "" }));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the scheduler"));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(() => {
    return jobs.filter((job) => {
      const haystack = `${job.title} ${job.workspace.name} ${job.requestedBy?.username || ""}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (filter === "active") return job.status === "QUEUED" || job.status === "RUNNING";
      if (filter === "queued") return job.status === "QUEUED";
      if (filter === "running") return job.status === "RUNNING";
      return true;
    });
  }, [jobs, filter, query]);

  async function submitJob(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/gpu/jobs", { method: "POST", body: JSON.stringify(jobForm) });
      setJobOpen(false);
      setMessage("Job submitted to the GPU scheduler.");
      setJobForm((current) => ({ ...current, title: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue the job");
    } finally {
      setBusy(false);
    }
  }

  async function finish(id: string, action: "complete" | "cancel") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/gpu/jobs/${id}`, { method: "POST", body: JSON.stringify({ action }) });
      setMessage(action === "complete" ? "Job completed and the GPU was released." : "Job cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the job");
    } finally {
      setBusy(false);
    }
  }

  async function addGpu(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/gpu", {
        method: "POST",
        body: JSON.stringify({
          name: gpuForm.name,
          memoryMb: Number(gpuForm.memoryMb),
          index: gpuForm.index === "" ? undefined : Number(gpuForm.index),
        }),
      });
      setGpuOpen(false);
      setGpuForm({ name: "", memoryMb: 16384, index: "" });
      setMessage("GPU added to the pool.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the GPU");
    } finally {
      setBusy(false);
    }
  }

  async function removeGpu(id: string) {
    setBusy(true);
    try {
      await api(`/api/gpu/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the GPU");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="GPU Scheduler"
        subtitle="Request a GPU separately from the command. A free GPU attaches immediately. After one GPU command finishes, it is released."
        action={
          <div className="flex gap-2">
            {me?.role === "ADMIN" ? (
              <SecondaryButton onClick={() => setGpuOpen(true)}>
                <PlusIcon className="h-4 w-4" />
                Add GPU
              </SecondaryButton>
            ) : null}
            <PrimaryButton onClick={() => setJobOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Queue job
            </PrimaryButton>
          </div>
        }
      />
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gpus.map((gpu) => (
          <article key={gpu.id} className="rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e7f6f4] text-[#00968a]">
                <GpuIcon className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#667085]">
                {gpu.status === "BUSY" ? "busy" : "free"}
              </span>
            </div>
            <h3 className="mt-4 text-[17px] font-semibold">{gpu.name}</h3>
            <p className="mt-2 text-sm text-[#8b9098]">Index {gpu.index} · {formatRam(gpu.memoryMb)}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-[#8b9098]">Workspace</span>
              <span className="rounded-lg bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#4b5160]">
                {gpu.workspace ? `${gpu.workspace.name}${gpu.workspace.gpuMode === "SIMULATED" ? " · simulated" : ""}` : "Available"}
              </span>
            </div>
            {me?.role === "ADMIN" && gpu.status === "FREE" ? (
              <button type="button" className="mt-4 text-sm font-medium text-[#c2413b]" onClick={() => void removeGpu(gpu.id)}>
                Remove from pool
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <FilterBar query={query} onQuery={setQuery} placeholder="Search jobs..." filters={filters} active={filter} onFilter={setFilter} />
      {visible.length === 0 ? (
        <EmptyState title="Queue is clear" body="Submit a job when a workspace needs a GPU. If every GPU is busy, the job waits until one is freed." />
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <article key={job.id} className="rounded-2xl border border-[#e6e8ee] bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#17181c]">{job.title}</p>
                  <p className="mt-1 text-sm text-[#8b9098]">
                    {job.workspace.name}
                    {job.requestedBy ? ` · @${job.requestedBy.username}` : ""} · {formatWhen(job.createdAt)}
                  </p>
                  {job.command ? <p className="mt-2 font-mono text-xs text-[#0f766e]">{job.command}</p> : <p className="mt-2 text-xs text-[#8b9098]">GPU request. The next GPU command uses it, then it is released.</p>}
                  {job.output ? <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f6f7f8] p-3 font-mono text-xs text-[#334155]">{job.output}</pre> : null}
                  {job.error ? <p className="mt-2 text-xs text-[#9f1c1c]">{job.error}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-[#4b5160]">
                    {job.status === "QUEUED" ? `queue ${job.position}` : job.status.toLowerCase()}
                  </span>
                  {job.status === "RUNNING" ? <SecondaryButton disabled={busy} onClick={() => void finish(job.id, "complete")}>Release GPU</SecondaryButton> : null}
                  {job.status === "QUEUED" || job.status === "RUNNING" ? <DangerButton disabled={busy} onClick={() => void finish(job.id, "cancel")}>Cancel</DangerButton> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {jobOpen ? (
        <Modal title="Queue a GPU job" subtitle="If a GPU is free, the workspace container receives it now. Otherwise the job waits." onClose={() => setJobOpen(false)}>
          <form onSubmit={submitJob}>
            <Field label="Workspace">
              <select className={inputClass} value={jobForm.workspaceId} onChange={(event) => setJobForm({ ...jobForm, workspaceId: event.target.value })} required>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Title"><input className={inputClass} value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} required placeholder="Train model" /></Field>
            <Field label="Command">
              <input className={inputClass} value={jobForm.command} onChange={(event) => setJobForm({ ...jobForm, command: event.target.value })} placeholder="Leave empty to hold the GPU" />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setJobOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={busy} type="submit">{busy ? "Queueing..." : "Queue job"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {gpuOpen ? (
        <Modal title="Add GPU" subtitle="The index maps to the NVIDIA device id when the container runtime is available." onClose={() => setGpuOpen(false)}>
          <form onSubmit={addGpu}>
            <Field label="Name"><input className={inputClass} value={gpuForm.name} onChange={(event) => setGpuForm({ ...gpuForm, name: event.target.value })} required placeholder="GPU 2" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Memory (MB)"><input className={inputClass} type="number" min={256} value={gpuForm.memoryMb} onChange={(event) => setGpuForm({ ...gpuForm, memoryMb: Number(event.target.value) })} /></Field>
              <Field label="Index"><input className={inputClass} value={gpuForm.index} onChange={(event) => setGpuForm({ ...gpuForm, index: event.target.value })} placeholder="Auto" /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setGpuOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={busy} type="submit">Add GPU</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

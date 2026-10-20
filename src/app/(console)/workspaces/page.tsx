"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { Banner, EmptyState, Field, FilterBar, Modal, PageHeader, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";
import { WorkspaceCard, type WorkspaceCardData } from "@/components/workspace-card";
import { api } from "@/lib/client";
import { formatCores, formatRam, gbToMb, shellPreview } from "@/lib/format";

type UserOption = { id: string; name: string; username: string; status: string; role: string };
type Me = { role: "ADMIN" | "USER" };
type HostStats = {
  hostname: string;
  operatingSystem: string;
  architecture: string;
  cpuCores: number;
  cpuAllocated: number;
  cpuAvailable: number;
  ramTotalMb: number;
  ramAllocatedMb: number;
  ramAvailableMb: number;
};

const filters = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "stopped", label: "Stopped" },
  { id: "gpu", label: "GPU" },
  { id: "error", label: "Error" },
];

export default function WorkspacesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceCardData[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", ownerId: "", cpu: 2, memoryGb: 4 });
  const [host, setHost] = useState<HostStats | null>(null);

  async function load() {
    const [session, list] = await Promise.all([
      api<{ user: Me }>("/api/auth/me"),
      api<{ workspaces: WorkspaceCardData[] }>("/api/workspaces"),
    ]);
    setMe(session.user);
    setWorkspaces(list.workspaces);
    if (session.user.role === "ADMIN") {
      const [people, capacity] = await Promise.all([
        api<{ users: UserOption[] }>("/api/users"),
        api<{ host: HostStats }>("/api/host"),
      ]);
      const active = people.users.filter((user) => user.status === "ACTIVE");
      setUsers(active);
      setHost(capacity.host);
      setForm((current) => ({ ...current, ownerId: current.ownerId || active.find((user) => user.role === "USER")?.id || active[0]?.id || "" }));
    } else {
      setHost(null);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load workspaces"));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(() => {
    return workspaces.filter((workspace) => {
      const haystack = `${workspace.name} ${workspace.description} ${workspace.prompt} ${workspace.owner?.username || ""}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (filter === "running") return workspace.status === "RUNNING";
      if (filter === "stopped") return workspace.status === "STOPPED";
      if (filter === "gpu") return workspace.gpuMode !== "NONE";
      if (filter === "error") return workspace.status === "ERROR";
      return true;
    });
  }, [workspaces, query, filter]);

  const owner = users.find((user) => user.id === form.ownerId);
  const canCreate =
    form.name.trim().length >= 2 && Boolean(form.ownerId) && form.cpu >= 0.25 && form.memoryGb >= 0.25;

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          ownerId: form.ownerId,
          cpu: Number(form.cpu),
          memoryMb: gbToMb(Number(form.memoryGb)),
        }),
      });
      setMessage("Workspace container created.");
      setOpen(false);
      setForm((current) => ({ ...current, name: "", description: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Workspaces"
        subtitle="Create a container per workspace, assign it to an account, and set CPU and memory limits."
        action={
          me?.role === "ADMIN" ? (
            <PrimaryButton onClick={() => setOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              Add Workspace
            </PrimaryButton>
          ) : null
        }
      />
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {me?.role === "ADMIN" && host ? (
        <section className="mb-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-[#e6e8ee] bg-white px-5 py-4 shadow-card">
            <p className="text-sm text-[#8b9098]">Host CPU</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#17181c]">{formatCores(host.cpuAvailable)} left</p>
            <p className="mt-2 text-sm text-[#8b9098]">
              {formatCores(host.cpuCores)} on {host.hostname || "this host"}
              {host.architecture ? ` · ${host.architecture}` : ""}
              {host.operatingSystem ? ` · ${host.operatingSystem}` : ""}
            </p>
            <p className="mt-1 text-sm text-[#8b9098]">
              {host.cpuAllocated > 0
                ? `${formatCores(host.cpuAllocated)} reserved by running workspaces`
                : "Full availability. Stopped workspaces do not reserve CPU."}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef1f4]">
              <div
                className="h-full rounded-full bg-[#00968a]"
                style={{ width: host.cpuCores ? `${Math.min(100, (host.cpuAllocated / host.cpuCores) * 100)}%` : "0%" }}
              />
            </div>
          </article>
          <article className="rounded-2xl border border-[#e6e8ee] bg-white px-5 py-4 shadow-card">
            <p className="text-sm text-[#8b9098]">Host RAM</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#17181c]">{formatRam(host.ramAvailableMb)} left</p>
            <p className="mt-2 text-sm text-[#8b9098]">{formatRam(host.ramTotalMb)} on this host</p>
            <p className="mt-1 text-sm text-[#8b9098]">
              {host.ramAllocatedMb > 0
                ? `${formatRam(host.ramAllocatedMb)} reserved by running workspaces`
                : "Full availability. Stopped workspaces do not reserve RAM."}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef1f4]">
              <div
                className="h-full rounded-full bg-[#00968a]"
                style={{
                  width: host.ramTotalMb ? `${Math.min(100, (host.ramAllocatedMb / host.ramTotalMb) * 100)}%` : "0%",
                }}
              />
            </div>
          </article>
        </section>
      ) : null}
      <FilterBar
        query={query}
        onQuery={setQuery}
        placeholder="Search workspaces..."
        filters={filters}
        active={filter}
        onFilter={setFilter}
      />
      {visible.length === 0 ? (
        <EmptyState title="No workspaces yet" body="An administrator can create a workspace, assign it to an account, and the control plane will start its container." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}

      {open ? (
        <Modal title="Add workspace" subtitle="This starts a new container and binds it to the selected account." onClose={() => setOpen(false)}>
          <form onSubmit={createWorkspace}>
            <Field label="Name" required>
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={60} />
            </Field>
            <Field label="Description">
              <textarea className={inputClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Assign to" required>
              <select className={inputClass} value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} (@{user.username})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CPUs" required>
                <input className={inputClass} type="number" min={0.25} max={32} step={0.25} value={form.cpu} onChange={(event) => setForm({ ...form, cpu: Number(event.target.value) })} required />
              </Field>
              <Field label="RAM (GB)" required>
                <input className={inputClass} type="number" min={0.25} max={64} step={0.25} value={form.memoryGb} onChange={(event) => setForm({ ...form, memoryGb: Number(event.target.value) })} required />
              </Field>
            </div>
            <div className="mb-4 rounded-xl bg-[#0f172b] px-4 py-3 font-mono text-sm text-[#d8fff4]">
              {owner ? shellPreview(owner.username, form.name || "workspace") : "username@crems-workspace~:$"}
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={busy || !canCreate}>{busy ? "Creating container..." : "Create workspace"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { Banner, EmptyState, Field, FilterBar, Modal, PageHeader, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";
import { WorkspaceCard, type WorkspaceCardData } from "@/components/workspace-card";
import { api } from "@/lib/client";
import { shellPreview } from "@/lib/format";

type UserOption = { id: string; name: string; username: string; status: string; role: string };
type Me = { role: "ADMIN" | "USER" };

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
  const [form, setForm] = useState({ name: "", description: "", ownerId: "", cpu: 2, memoryMb: 4096 });

  async function load() {
    const [session, list] = await Promise.all([
      api<{ user: Me }>("/api/auth/me"),
      api<{ workspaces: WorkspaceCardData[] }>("/api/workspaces"),
    ]);
    setMe(session.user);
    setWorkspaces(list.workspaces);
    if (session.user.role === "ADMIN") {
      const people = await api<{ users: UserOption[] }>("/api/users");
      const active = people.users.filter((user) => user.status === "ACTIVE");
      setUsers(active);
      setForm((current) => ({ ...current, ownerId: current.ownerId || active.find((user) => user.role === "USER")?.id || active[0]?.id || "" }));
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load workspaces"));
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
          memoryMb: Number(form.memoryMb),
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
            <Field label="Name">
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="Workspace 1" />
            </Field>
            <Field label="Description">
              <textarea className={inputClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Assign to">
              <select className={inputClass} value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} (@{user.username})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CPUs">
                <input className={inputClass} type="number" min={0.25} max={32} step={0.25} value={form.cpu} onChange={(event) => setForm({ ...form, cpu: Number(event.target.value) })} required />
              </Field>
              <Field label="RAM (MB)">
                <input className={inputClass} type="number" min={256} max={65536} step={256} value={form.memoryMb} onChange={(event) => setForm({ ...form, memoryMb: Number(event.target.value) })} required />
              </Field>
            </div>
            <div className="mb-4 rounded-xl bg-[#0f172b] px-4 py-3 font-mono text-sm text-[#d8fff4]">
              {owner ? shellPreview(owner.username, form.name || "workspace") : "username@myspace-workspace~:$"}
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={busy}>{busy ? "Creating container..." : "Create workspace"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

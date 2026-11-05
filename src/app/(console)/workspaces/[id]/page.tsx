"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileBrowser } from "@/components/file-browser";
import { Banner, DangerButton, Field, Modal, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";
import { gbToMb, mbToGb } from "@/lib/format";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  description: string;
  cpu: number;
  memoryMb: number;
  status: string;
  gpuMode: string;
  lastError: string | null;
  prompt: string;
  containerName: string | null;
  codePort: number | null;
  owner: { id: string; name: string; username: string } | null;
  gpu: { index: number; name: string } | null;
  enforced: { cpu: number; memoryMb: number; running: boolean } | null;
  activeJob: { id: string; title: string; status: string } | null;
};

type UserOption = { id: string; name: string; username: string; status: string };
type Me = { role: "ADMIN" | "USER"; id: string };

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", ownerId: "", cpu: 1, memoryGb: 2 });

  async function load() {
    const [session, detail] = await Promise.all([
      api<{ user: Me }>("/api/auth/me"),
      api<{ workspace: Workspace }>(`/api/workspaces/${params.id}`),
    ]);
    setMe(session.user);
    setWorkspace(detail.workspace);
    setForm({
      name: detail.workspace.name,
      description: detail.workspace.description,
      ownerId: detail.workspace.owner?.id || "",
      cpu: detail.workspace.cpu,
      memoryGb: mbToGb(detail.workspace.memoryMb),
    });
    if (session.user.role === "ADMIN") {
      const people = await api<{ users: UserOption[] }>("/api/users");
      setUsers(people.users.filter((user) => user.status === "ACTIVE"));
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load workspace"));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [params.id]);

  async function power(action: "start" | "stop" | "retry") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/workspaces/${params.id}/power`, { method: "POST", body: JSON.stringify({ action }) });
      setMessage(action === "stop" ? "Workspace stopped." : "Workspace is running.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change power state");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/workspaces/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          ownerId: form.ownerId,
          cpu: Number(form.cpu),
          memoryMb: gbToMb(Number(form.memoryGb)),
        }),
      });
      setEditing(false);
      setMessage("Workspace updated. CPU and RAM limits are enforced on the container.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the workspace");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this workspace and its container?")) return;
    setBusy(true);
    try {
      await api(`/api/workspaces/${params.id}`, { method: "DELETE" });
      router.push("/workspaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the workspace");
      setBusy(false);
    }
  }

  function openView(path: string) {
    window.open(path, "_blank", "noopener,noreferrer");
  }

  async function requestGpu() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ state: "attached" | "queued" }>(`/api/workspaces/${params.id}/gpu`, { method: "POST" });
      setMessage(
        result.state === "attached"
          ? "A GPU is attached. It releases after the next GPU command."
          : "Every GPU is busy. This workspace is queued.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a GPU");
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return <p className="text-sm text-[#8b9098]">Loading workspace...</p>;
  }

  return (
    <div>
      <Link href="/workspaces" className="text-sm font-medium text-[#00968a]">
        Back to workspaces
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{workspace.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#8b9098]">{workspace.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-[#d5d8de] bg-[#f3f4f6] p-1.5">
            <LaunchButton label="File browser" active icon={<FolderIcon />} onClick={() => undefined} />
            <LaunchButton
              label="code-server"
              disabled={workspace.status !== "RUNNING" || !workspace.codePort}
              onClick={() => openView(`/view/code/${workspace.id}`)}
              icon={<CodeServerIcon />}
            />
            <LaunchButton
              label="Terminal"
              disabled={workspace.status !== "RUNNING"}
              onClick={() => openView(`/view/terminal/${workspace.id}`)}
              icon={<TerminalIcon />}
            />
          </div>
          <PrimaryButton
            disabled={busy || workspace.status !== "RUNNING" || Boolean(workspace.gpu) || workspace.activeJob?.status === "QUEUED"}
            onClick={() => void requestGpu()}
          >
            {workspace.gpu ? "GPU attached" : workspace.activeJob?.status === "QUEUED" ? "GPU queued" : "Request GPU"}
          </PrimaryButton>
          {me?.role === "ADMIN" ? (
            <>
              <SecondaryButton onClick={() => setEditing(true)}>Edit limits</SecondaryButton>
              {workspace.status === "RUNNING" ? (
                <SecondaryButton disabled={busy} onClick={() => void power("stop")}>Stop</SecondaryButton>
              ) : (
                <PrimaryButton disabled={busy} onClick={() => void power(workspace.status === "ERROR" ? "retry" : "start")}>
                  {workspace.status === "ERROR" ? "Retry" : "Start"}
                </PrimaryButton>
              )}
              <DangerButton disabled={busy} onClick={() => void remove()}>Delete</DangerButton>
            </>
          ) : null}
        </div>
      </div>
      {message ? <div className="mt-4"><Banner tone="ok">{message}</Banner></div> : null}
      {error ? <div className="mt-4"><Banner tone="error">{error}</Banner></div> : null}
      {workspace.lastError ? <div className="mt-4"><Banner tone="error">{workspace.lastError}</Banner></div> : null}

      {workspace.owner ? (
        <FileBrowser workspaceId={workspace.id} username={workspace.owner.username} running={workspace.status === "RUNNING"} />
      ) : (
        <section className="mt-5 rounded-2xl border border-[#e6e8ee] bg-white p-8 text-sm text-[#8b9098] shadow-card">
          Assign this workspace to an account before browsing its files.
        </section>
      )}

      {editing ? (
        <Modal title="Edit workspace" subtitle="Changing the owner recreates the container so the shell prompt matches the account." onClose={() => setEditing(false)}>
          <form onSubmit={save}>
            <Field label="Name">
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea className={inputClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            <Field label="Assign to">
              <select className={inputClass} value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} (@{user.username})</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CPUs">
                <input className={inputClass} type="number" min={0.25} max={32} step={0.25} value={form.cpu} onChange={(event) => setForm({ ...form, cpu: Number(event.target.value) })} />
              </Field>
              <Field label="RAM (GB)">
                <input className={inputClass} type="number" min={0.25} max={64} step={0.25} value={form.memoryGb} onChange={(event) => setForm({ ...form, memoryGb: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setEditing(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function LaunchButton({
  label,
  icon,
  disabled,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-[#00968a] bg-white text-[#0f766e]" : "border-[#d7dbe2] bg-white text-[#1c2430] hover:bg-[#f7f8fa]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#3b82f6" d="M3.2 7.2A2.2 2.2 0 0 1 5.4 5h3.4c.5 0 1 .2 1.3.6l1 1.1H18.6A2.2 2.2 0 0 1 20.8 8.9v8.4a2.2 2.2 0 0 1-2.2 2.2H5.4a2.2 2.2 0 0 1-2.2-2.2V7.2Z" />
    </svg>
  );
}

function CodeServerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="4" fill="#007acc" />
      <path d="M9.2 8.2 6.4 12l2.8 3.8M14.8 8.2 17.6 12l-2.8 3.8" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#1e2430" />
      <path d="M6.5 9.2 9.2 12 6.5 14.8M11 15.2h6" fill="none" stroke="#3ddc97" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

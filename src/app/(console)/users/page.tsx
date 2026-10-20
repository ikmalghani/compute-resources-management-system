"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, UsersIcon } from "@/components/icons";
import { Banner, DangerButton, EmptyState, Field, FilterBar, Modal, PageHeader, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";
import { roleLabel } from "@/lib/format";

type Account = {
  id: string;
  name: string;
  username: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  mustChangePassword: boolean;
  createdAt: string;
};

type IssuedPassword = { username: string; temporaryPassword: string };

const filters = [
  { id: "all", label: "All" },
  { id: "admins", label: "Admins" },
  { id: "members", label: "Members" },
  { id: "suspended", label: "Suspended" },
];

const blank = { name: "", username: "", role: "USER" as "ADMIN" | "USER" };

export default function UsersPage() {
  const [me, setMe] = useState<Account | null>(null);
  const [users, setUsers] = useState<Account[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [form, setForm] = useState(blank);
  const [editForm, setEditForm] = useState({ name: "", role: "USER" as "ADMIN" | "USER", status: "ACTIVE" as "ACTIVE" | "SUSPENDED" });

  async function load() {
    const [session, list] = await Promise.all([
      api<{ user: Account }>("/api/auth/me"),
      api<{ users: Account[] }>("/api/users"),
    ]);
    setMe(session.user);
    setUsers(list.users);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts"));
  }, []);

  const visible = useMemo(() => {
    return users.filter((user) => {
      const haystack = `${user.name} ${user.username}`.toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (filter === "admins") return user.role === "ADMIN";
      if (filter === "members") return user.role === "USER";
      if (filter === "suspended") return user.status === "SUSPENDED";
      return true;
    });
  }, [users, query, filter]);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: Account; temporaryPassword: string }>("/api/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setCreating(false);
      setForm(blank);
      setIssued({ username: result.user.username, temporaryPassword: result.temporaryPassword });
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(user: Account) {
    setEditing(user);
    setEditForm({ name: user.name, role: user.role, status: user.status });
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(editForm) });
      setEditing(null);
      setMessage(editForm.status === "ACTIVE" ? "Access granted." : "Access revoked.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account");
    } finally {
      setBusy(false);
    }
  }

  async function rotate(user: Account) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ username: string; temporaryPassword: string }>(`/api/users/${user.id}/password`, { method: "POST" });
      setEditing(null);
      setIssued(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate the password");
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: Account) {
    if (!confirm(`Delete ${user.username}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      setEditing(null);
      setMessage(`Deleted ${user.username}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.temporaryPassword);
    setMessage(`Copied the one-time password for ${issued.username}.`);
  }

  if (me && me.role !== "ADMIN") {
    return <EmptyState title="Administrators only" body="Only an administrator can create, modify, grant access, or delete accounts." />;
  }

  return (
    <div>
      <PageHeader
        title="User management"
        subtitle="Administrators create accounts with a generated password, then rotate it when needed. Passwords are never shown again."
        action={
          <PrimaryButton onClick={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            Add account
          </PrimaryButton>
        }
      />
      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <FilterBar query={query} onQuery={setQuery} placeholder="Search accounts..." filters={filters} active={filter} onFilter={setFilter} />
      {visible.length === 0 ? (
        <EmptyState title="No accounts match" body="Create an account. The temporary password is shown once, and the user replaces it at the first sign-in." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((user) => (
            <article key={user.id} className="flex h-full flex-col rounded-2xl border border-[#e6e8ee] bg-white p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef4ff] text-[#3b82f6]">
                  <UsersIcon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#667085]">{roleLabel(user.role)}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{user.name}</h3>
              <p className="mt-2 font-mono text-[13px] text-[#0f766e]">@{user.username}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-[#8b9098]">Access</span>
                <span className="rounded-lg bg-[#f3f4f6] px-2.5 py-1 text-xs font-medium text-[#4b5160]">
                  {user.status === "ACTIVE" ? "Granted" : "Revoked"}
                </span>
              </div>
              <p className="mt-3 text-xs text-[#8b9098]">
                {user.mustChangePassword ? "Waiting for the user to set a password." : "Password is set by the user."}
              </p>
              <PrimaryButton className="mt-4 w-full" onClick={() => openEdit(user)}>
                {user.status === "SUSPENDED" ? "Grant access" : "Manage account"}
              </PrimaryButton>
            </article>
          ))}
        </div>
      )}

      {creating ? (
        <Modal title="Add account" subtitle="CReMS generates the password. It is shown once, then only a hash is stored." onClose={() => setCreating(false)}>
          <form onSubmit={createUser}>
            <Field label="Full name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="Username"><input className={inputClass} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required placeholder="bob" /></Field>
            <Field label="Role">
              <select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "ADMIN" | "USER" })}>
                <option value="USER">Member</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setCreating(false)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={busy} type="submit">{busy ? "Creating..." : "Create account"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Manage ${editing.username}`} subtitle="Rotate the password to issue a new one. The current password cannot be viewed." onClose={() => setEditing(null)}>
          <form onSubmit={saveUser}>
            <Field label="Full name"><input className={inputClass} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></Field>
            <Field label="Role">
              <select className={inputClass} value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as "ADMIN" | "USER" })}>
                <option value="USER">Member</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </Field>
            <Field label="Access">
              <select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as "ACTIVE" | "SUSPENDED" })}>
                <option value="ACTIVE">Granted</option>
                <option value="SUSPENDED">Revoked</option>
              </select>
            </Field>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <DangerButton type="button" disabled={busy} onClick={() => void remove(editing)}>Delete</DangerButton>
              <SecondaryButton type="button" disabled={busy} onClick={() => void rotate(editing)}>Rotate password</SecondaryButton>
            </div>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setEditing(null)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={busy} type="submit">{editForm.status === "ACTIVE" ? "Save access" : "Revoke access"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {issued ? (
        <Modal title={`Password for ${issued.username}`} subtitle="Copy it now. This is the only time it is shown." onClose={() => setIssued(null)}>
          <p className="rounded-xl bg-[#0f172b] px-4 py-3 font-mono text-sm tracking-wide text-[#d8fff4]">{issued.temporaryPassword}</p>
          <p className="mt-3 text-sm leading-6 text-[#8b9098]">
            The user signs in with this password and is asked to replace it. Rotating later issues a new password. The previous one cannot be recovered.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => void copyPassword()}>Copy</SecondaryButton>
            <PrimaryButton type="button" onClick={() => setIssued(null)}>Done</PrimaryButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

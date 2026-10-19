"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { DangerButton, Field, Modal, PrimaryButton, SecondaryButton, inputClass } from "@/components/ui";

type Entry = { name: string; path: string; type: "dir" | "file"; size: number };
type Preview = { path: string; size: number; text: string; binary: boolean; truncated: boolean };
type Dialog = "folder" | "file" | "rename" | "delete" | null;

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

export function FileBrowser({ workspaceId, username, running }: { workspaceId: string; username: string; running: boolean }) {
  const [tree, setTree] = useState<Record<string, Entry[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });
  const [selected, setSelected] = useState<Entry | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const destination = !selected ? "" : selected.type === "dir" ? selected.path : parentPath(selected.path);
  const dirty = editing && preview !== null && draft !== preview.text;

  async function load(path: string) {
    const data = await api<{ entries: Entry[] }>(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`);
    setTree((current) => ({ ...current, [path]: data.entries }));
    return data.entries;
  }

  useEffect(() => {
    if (!running) return;
    setTree({});
    setOpen({ "": true });
    setSelected(null);
    setPreview(null);
    setEditing(false);
    setError("");
    void load("").catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not list that folder");
    });
  }, [workspaceId, running]);

  function blockIfDirty() {
    if (!dirty) return false;
    setError("Save or cancel the edit before leaving this file.");
    return true;
  }

  async function toggle(entry: Entry) {
    if (blockIfDirty()) return;
    setSelected(entry);
    const next = !open[entry.path];
    setOpen((current) => ({ ...current, [entry.path]: next }));
    if (next && !tree[entry.path]) {
      try {
        await load(entry.path);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not list that folder");
      }
    }
  }

  async function openFile(entry: Entry) {
    if (blockIfDirty()) return;
    setSelected(entry);
    setEditing(false);
    try {
      const data = await api<Preview>(`/api/workspaces/${workspaceId}/files?content=1&path=${encodeURIComponent(entry.path)}`);
      setPreview(data);
      setDraft(data.text);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that file");
    }
  }

  function forget(path: string) {
    setTree((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key === path || key.startsWith(`${path}/`)) delete next[key];
      }
      return next;
    });
    setOpen((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key === path || key.startsWith(`${path}/`)) delete next[key];
      }
      return next;
    });
  }

  async function submitDialog(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog || dialog === "delete") return;
    setBusy(dialog);
    setError("");
    try {
      if (dialog === "folder" || dialog === "file") {
        const created = await api<{ path: string }>(`/api/workspaces/${workspaceId}/files`, {
          method: "POST",
          body: JSON.stringify({ action: dialog === "folder" ? "mkdir" : "create", parent: destination, name }),
        });
        setOpen((current) => ({ ...current, [destination]: true }));
        const entries = await load(destination);
        const entry = entries.find((item) => item.path === created.path) || null;
        setSelected(entry);
        if (dialog === "file" && entry) {
          setPreview({ path: entry.path, size: 0, text: "", binary: false, truncated: false });
          setDraft("");
          setEditing(true);
        }
      } else if (dialog === "rename" && selected) {
        const renamed = await api<{ path: string }>(`/api/workspaces/${workspaceId}/files`, {
          method: "POST",
          body: JSON.stringify({ action: "rename", path: selected.path, name }),
        });
        const parent = parentPath(selected.path);
        if (selected.type === "dir") forget(selected.path);
        const entries = await load(parent);
        const entry = entries.find((item) => item.path === renamed.path) || null;
        setSelected(entry);
        if (preview?.path === selected.path && entry?.type === "file") {
          const data = await api<Preview>(`/api/workspaces/${workspaceId}/files?content=1&path=${encodeURIComponent(entry.path)}`);
          setPreview(data);
          setDraft(data.text);
          setEditing(false);
        } else if (preview?.path === selected.path) {
          setPreview(null);
          setEditing(false);
        }
      }
      setDialog(null);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that item");
    } finally {
      setBusy("");
    }
  }

  async function confirmDelete() {
    if (!selected) return;
    setBusy("delete");
    setError("");
    try {
      const removed = selected.path;
      await api(`/api/workspaces/${workspaceId}/files`, {
        method: "POST",
        body: JSON.stringify({ action: "delete", path: removed }),
      });
      forget(removed);
      await load(parentPath(removed));
      if (preview && (preview.path === removed || preview.path.startsWith(`${removed}/`))) {
        setPreview(null);
        setEditing(false);
        setDraft("");
      }
      setSelected(null);
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that item");
    } finally {
      setBusy("");
    }
  }

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || blockIfDirty()) return;
    setBusy("upload");
    setError("");
    try {
      let lastPath = "";
      for (const file of files) {
        const form = new FormData();
        form.set("path", destination);
        form.set("file", file);
        const response = await fetch(`/api/workspaces/${workspaceId}/files`, { method: "POST", body: form });
        const data = (await response.json().catch(() => ({}))) as { error?: string; path?: string };
        if (response.status === 403 && data.error === "Change your password before continuing") {
          window.location.assign("/account/password");
          return;
        }
        if (!response.ok || !data.path) throw new Error(data.error || "Could not upload that file");
        lastPath = data.path;
      }
      setOpen((current) => ({ ...current, [destination]: true }));
      const entries = await load(destination);
      const entry = entries.find((item) => item.path === lastPath);
      if (entry?.type === "file") await openFile(entry);
      else if (entry) setSelected(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file");
    } finally {
      setBusy("");
    }
  }

  async function saveEdit() {
    if (!preview) return;
    setBusy("save");
    setError("");
    try {
      await api(`/api/workspaces/${workspaceId}/files`, {
        method: "POST",
        body: JSON.stringify({ action: "write", path: preview.path, content: draft }),
      });
      await load(parentPath(preview.path));
      const data = await api<Preview>(`/api/workspaces/${workspaceId}/files?content=1&path=${encodeURIComponent(preview.path)}`);
      setPreview(data);
      setDraft(data.text);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that file");
    } finally {
      setBusy("");
    }
  }

  function cancelEdit() {
    setDraft(preview?.text || "");
    setEditing(false);
    setError("");
  }

  if (!running) {
    return (
      <section className="mt-5 rounded-2xl border border-[#e6e8ee] bg-white p-8 text-sm text-[#8b9098] shadow-card">
        Start the workspace to browse its files.
      </section>
    );
  }

  const location = destination ? `/home/${username}/${destination}` : `/home/${username}`;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#e6e8ee] bg-white shadow-card">
      <div className="border-b border-[#eef0f3] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#17181c]">File browser</h2>
            <p className="mt-0.5 font-mono text-xs text-[#8b9098]">{location}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="New folder" disabled={Boolean(busy)} onClick={() => { if (blockIfDirty()) return; setName(""); setDialog("folder"); }}>
              <FolderGlyph />
            </ActionButton>
            <ActionButton label="New file" disabled={Boolean(busy)} onClick={() => { if (blockIfDirty()) return; setName(""); setDialog("file"); }}>
              <FileGlyph />
            </ActionButton>
            <ActionButton label={busy === "upload" ? "Uploading..." : "Upload"} disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()}>
              <UploadGlyph />
            </ActionButton>
            <ActionButton
              label="Rename"
              disabled={!selected || Boolean(busy)}
              onClick={() => {
                if (!selected || blockIfDirty()) return;
                setName(selected.name);
                setDialog("rename");
              }}
            >
              <RenameGlyph />
            </ActionButton>
            <ActionButton
              label="Delete"
              tone="danger"
              disabled={!selected || Boolean(busy)}
              onClick={() => {
                if (!selected || blockIfDirty()) return;
                setDialog("delete");
              }}
            >
              <DeleteGlyph />
            </ActionButton>
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-[#9f1c1c]">{error}</p> : null}
        <input ref={uploadRef} type="file" multiple className="hidden" onChange={(event) => void onUpload(event)} />
      </div>
      <div className="grid min-h-[520px] lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <div className="max-h-[640px] overflow-auto border-b border-[#eef0f3] py-2 lg:border-b-0 lg:border-r">
          <TreeRows
            path=""
            depth={0}
            tree={tree}
            open={open}
            selected={selected?.path || ""}
            onToggle={(entry) => void toggle(entry)}
            onOpen={(entry) => void openFile(entry)}
          />
          {!tree[""] ? <p className="px-4 py-3 text-sm text-[#8b9098]">Loading files...</p> : null}
        </div>
        <div className="min-h-[280px] bg-[#fbfbfc]">
          {preview ? (
            <div className="flex h-full min-h-[280px] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f3] px-4 py-3">
                <p className="truncate font-mono text-sm text-[#17181c]">{preview.path}</p>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <button type="button" onClick={cancelEdit} disabled={busy === "save"} className="rounded-lg border border-[#e4e6eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#2a2e37] hover:bg-[#f7f8fa] disabled:opacity-50">
                        Cancel
                      </button>
                      <button type="button" onClick={() => void saveEdit()} disabled={busy === "save"} className="rounded-lg bg-[#00968a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#007f76] disabled:opacity-60">
                        {busy === "save" ? "Saving..." : "Save"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[#8b9098]">
                        {formatSize(preview.size)}
                        {preview.truncated ? " · first 8 KB" : ""}
                      </p>
                      {!preview.binary && !preview.truncated ? (
                        <button type="button" onClick={() => { setDraft(preview.text); setEditing(true); setError(""); }} className="rounded-lg border border-[#e4e6eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#2a2e37] hover:bg-[#f7f8fa]">
                          Edit
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              {preview.binary ? (
                <p className="px-4 py-6 text-sm text-[#8b9098]">This file is binary, so it is not shown as text.</p>
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  className="terminal-scroll min-h-[320px] flex-1 resize-y bg-white px-4 py-4 font-mono text-[13px] leading-6 text-[#1f2430] outline-none"
                />
              ) : (
                <>
                  {preview.truncated ? <p className="px-4 pt-4 text-xs text-[#8b9098]">This file is larger than 512 KB, so it stays read-only.</p> : null}
                  <pre className="terminal-scroll flex-1 whitespace-pre-wrap px-4 py-4 font-mono text-[13px] leading-6 text-[#1f2430]">{preview.text || "This file is empty."}</pre>
                </>
              )}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-[#8b9098]">
              {selected?.type === "dir"
                ? `New files and uploads go in ${selected.name}.`
                : "Select a file to read it. Folders expand in the tree."}
            </p>
          )}
        </div>
      </div>

      {dialog === "folder" || dialog === "file" || dialog === "rename" ? (
        <Modal
          title={dialog === "folder" ? "New folder" : dialog === "file" ? "New file" : "Rename"}
          subtitle={dialog === "rename" ? selected?.path : location}
          onClose={() => { if (!busy) setDialog(null); }}
        >
          <form onSubmit={(event) => void submitDialog(event)}>
            <Field label="Name">
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={Boolean(busy)}>{busy ? "Saving..." : dialog === "rename" ? "Rename" : "Create"}</PrimaryButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialog === "delete" && selected ? (
        <Modal title="Delete" subtitle={selected.path} onClose={() => { if (!busy) setDialog(null); }}>
          <p className="mb-5 text-sm text-[#3c4250]">
            Delete {selected.type === "dir" ? "folder" : "file"} <span className="font-medium">{selected.name}</span>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)}>Cancel</SecondaryButton>
            <DangerButton type="button" onClick={() => void confirmDelete()} disabled={Boolean(busy)}>{busy === "delete" ? "Deleting..." : "Delete"}</DangerButton>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  const color = tone === "danger"
    ? "border-[#f0d0ce] text-[#9f1c1c] hover:bg-[#fff5f5]"
    : "border-[#e4e6eb] text-[#2a2e37] hover:bg-[#f7f8fa]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${color}`}
    >
      {children}
      {label}
    </button>
  );
}

function TreeRows({
  path,
  depth,
  tree,
  open,
  selected,
  onToggle,
  onOpen,
}: {
  path: string;
  depth: number;
  tree: Record<string, Entry[]>;
  open: Record<string, boolean>;
  selected: string;
  onToggle: (entry: Entry) => void;
  onOpen: (entry: Entry) => void;
}) {
  const entries = tree[path];
  if (!entries) return null;
  return (
    <>
      {entries.map((entry) => {
        const expanded = Boolean(open[entry.path]);
        const active = selected === entry.path;
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => (entry.type === "dir" ? onToggle(entry) : onOpen(entry))}
              className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm hover:bg-[#f6f7f8] ${active ? "bg-[#e7f6f4] text-[#0f766e]" : "text-[#1f2430]"}`}
              style={{ paddingLeft: 12 + depth * 16 }}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#98a0aa]">
                {entry.type === "dir" ? (expanded ? "▾" : "▸") : ""}
              </span>
              {entry.type === "dir" ? <FolderIcon open={expanded} /> : <FileIcon />}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.type === "dir" && expanded ? (
              <TreeRows path={entry.path} depth={depth + 1} tree={tree} open={open} selected={selected} onToggle={onToggle} onOpen={onOpen} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill={open ? "#f5b942" : "#f0c14d"}
        d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.5 0 1 .2 1.4.6l1.1 1.2H18A2.5 2.5 0 0 1 20.5 9.3v7.2A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#8b93a0]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M7 3.8h6.2L19 9.6V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" />
      <path d="M13 3.8V9h5.2" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
      <path fill="#3b82f6" d="M3.2 7.4A2 2 0 0 1 5.2 5.4h3.2c.4 0 .8.2 1.1.5l.9 1h7.2a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V7.4Z" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#5c6570]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 3.8h6.2L19 9.6V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" />
      <path d="M13 3.8V9h5.2" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#00968a" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 16V5" />
      <path d="m8 8.5 4-4 4 4" />
      <path d="M5 19.5h14" />
    </svg>
  );
}

function RenameGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#5c6570" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="m12.5 7.5 4 4" />
    </svg>
  );
}

function DeleteGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 7.5h14" />
      <path d="M9.5 7.5V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M8 7.5 8.7 19a1.4 1.4 0 0 0 1.4 1.3h3.8a1.4 1.4 0 0 0 1.4-1.3L16 7.5" />
    </svg>
  );
}

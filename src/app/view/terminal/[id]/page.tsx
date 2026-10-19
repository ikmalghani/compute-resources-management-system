"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Workspace = {
  id: string;
  name: string;
  prompt: string;
  status: string;
  gpu: { name: string } | null;
  activeJob: { status: string } | null;
};

type ExecResult = { prompt: string; stdout: string; stderr: string; exitCode: number; needsGpu?: boolean };

export default function FullTerminalPage() {
  const params = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [command, setCommand] = useState("");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const detail = await api<{ workspace: Workspace }>(`/api/workspaces/${params.id}`);
    setWorkspace(detail.workspace);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not open the terminal"));
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [params.id]);

  async function runCommand(event: React.FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    setCommand("");
    try {
      const result = await api<ExecResult>(`/api/workspaces/${params.id}/exec`, {
        method: "POST",
        body: JSON.stringify({ command: value }),
      });
      const body = [result.stdout, result.stderr].filter(Boolean).join("");
      setLog((current) => `${current}${result.prompt} ${value}\n${body}${body.endsWith("\n") || !body ? "" : "\n"}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  const gpuLabel = workspace?.gpu
    ? `GPU attached · ${workspace.gpu.name}`
    : workspace?.activeJob?.status === "QUEUED"
      ? "Waiting for a GPU"
      : "No GPU attached";

  return (
    <div className="flex h-screen flex-col bg-[#0b1220] text-[#d7e2f0]">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{workspace?.name || "Workspace terminal"}</p>
          <p className="font-mono text-xs text-[#9ff7e8]">{workspace?.prompt || ""}</p>
        </div>
        <p className="text-xs uppercase tracking-wide text-[#93a0b5]">{gpuLabel}</p>
      </header>
      {error ? <p className="border-b border-[#ffd0d0]/20 bg-[#3b1515] px-5 py-2 text-sm text-[#ffd0d0]">{error}</p> : null}
      <pre className="terminal-scroll min-h-0 flex-1 whitespace-pre-wrap px-5 py-4 font-mono text-sm leading-6">
        {log || "The shell is ready. A command that needs a GPU asks you to request one first."}
      </pre>
      <form onSubmit={(event) => void runCommand(event)} className="flex gap-2 border-t border-white/10 p-4">
        <span className="hidden font-mono text-sm text-[#9ff7e8] sm:block">{workspace?.prompt}</span>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          autoFocus
          className="flex-1 rounded-xl bg-white/10 px-3 py-2 font-mono text-sm text-white outline-none"
          placeholder="command"
        />
        <button type="submit" disabled={busy || workspace?.status !== "RUNNING"} className="rounded-xl bg-[#00968a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Running" : "Run"}
        </button>
      </form>
    </div>
  );
}

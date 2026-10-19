"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/icons";
import { Banner, Field, PrimaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";

type SessionUser = { mustChangePassword: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push(result.user.mustChangePassword ? "/account/password" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#c9cfd4] px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-lg font-semibold text-[#17181c]">MYSPACE</p>
            <p className="text-sm text-[#8b9098]">Compute resources</p>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[#8b9098]">Use the username issued for your account.</p>
        <form onSubmit={onSubmit} className="mt-6">
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Field label="Username">
            <input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="mt-2 w-full">
            {busy ? "Signing in..." : "Sign in"}
          </PrimaryButton>
        </form>
        <div className="mt-6 rounded-2xl bg-[#f6f7f8] px-4 py-3 text-sm text-[#5c6370]">
          <p className="font-medium text-[#17181c]">First-boot administrator</p>
          <p className="mt-1">admin · admin123</p>
          <p className="mt-2 text-xs">Demo members: bob / bobpass1 and ada / adapass1.</p>
        </div>
      </div>
    </div>
  );
}

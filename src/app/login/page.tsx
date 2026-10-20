"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/icons";
import { Banner, Field, PrimaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";

type SessionUser = { mustChangePassword: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/auth/setup")
      .then((result) => {
        if (result.needsSetup) {
          router.replace("/setup");
          return;
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

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

  if (!ready) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#c9cfd4] px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-panel">
        <BrandLockup />
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
      </div>
    </div>
  );
}

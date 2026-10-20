"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/icons";
import { Banner, Field, PrimaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/auth/setup")
      .then((result) => {
        if (!result.needsSetup) {
          router.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("The passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ name, username, password }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the administrator");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#c9cfd4] px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-panel">
        <BrandLockup subtitle="First-time setup" />
        <h1 className="text-2xl font-semibold tracking-tight">Create the administrator</h1>
        <p className="mt-1 text-sm text-[#8b9098]">
          This instance has no administrator yet. Choose a username and password. The password is hashed before it is stored.
        </p>
        <form onSubmit={onSubmit} className="mt-6">
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Username">
            <input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm password">
            <input
              className={inputClass}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="mt-2 w-full">
            {busy ? "Creating..." : "Create administrator"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

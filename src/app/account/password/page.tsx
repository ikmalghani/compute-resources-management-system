"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLockup } from "@/components/icons";
import { Banner, Field, PrimaryButton, inputClass } from "@/components/ui";
import { api } from "@/lib/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#c9cfd4] px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-panel">
        <BrandLockup subtitle="Set your password" />
        <h1 className="text-2xl font-semibold tracking-tight">Change your password</h1>
        <p className="mt-1 text-sm text-[#8b9098]">
          This account is using a temporary password. Choose a new one before opening the dashboard.
        </p>
        <form onSubmit={onSubmit} className="mt-6">
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Field label="Temporary password">
            <input className={inputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <input className={inputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password">
            <input className={inputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="mt-2 w-full">
            {busy ? "Saving..." : "Save password"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

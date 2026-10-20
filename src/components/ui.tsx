"use client";

import { useEffect } from "react";

export const inputClass =
  "w-full rounded-xl border border-[#e4e6eb] bg-[#f6f7f8] px-3 py-2.5 text-sm text-[#17181c] outline-none transition focus:border-[#00968a] focus:bg-white focus:ring-2 focus:ring-[#00968a]/15";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[#17181c]">{title}</h1>
        <p className="mt-1 text-sm text-[#8b9098]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#00968a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f76] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#e4e6eb] bg-white px-4 py-2.5 text-sm font-semibold text-[#2a2e37] transition hover:bg-[#f7f8fa] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#c2413b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#a73530] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "border-[#b7eadf] bg-[#f0fbf8] text-[#0f6f64]"
      : "border-[#ffd0d0] bg-[#fff5f5] text-[#9f1c1c]";
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function FilterBar({
  query,
  onQuery,
  placeholder,
  filters,
  active,
  onFilter,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  filters: { id: string; label: string }[];
  active: string;
  onFilter: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#eceef2] bg-white px-3 py-2.5">
      <label className="relative min-w-[220px] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa0a8]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl bg-[#f3f3f5] py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-[#a0a4ab]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => onFilter(filter.id)}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              active === filter.id
                ? "bg-[#1e2430] text-white"
                : "border border-[#e6e8ee] bg-white text-[#3c4250] hover:bg-[#f6f7f9]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f172b]/45 px-4 py-10">
      <button className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#17181c]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[#8b9098]">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[#8b9098] hover:bg-[#f4f5f7]" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-[#1f2430]">
        {label}
        {required ? <span className="ml-0.5 text-[#e11d48]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d7dbe3] bg-white px-6 py-14 text-center">
      <h3 className="text-base font-semibold text-[#17181c]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8b9098]">{body}</p>
    </div>
  );
}

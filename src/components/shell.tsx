"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActivityIcon,
  BellIcon,
  DashboardIcon,
  GpuIcon,
  LogoMark,
  SearchIcon,
  UsersIcon,
  WorkspaceIcon,
} from "@/components/icons";
import { api } from "@/lib/client";
import { roleLabel } from "@/lib/format";

type Me = { id: string; name: string; username: string; role: "ADMIN" | "USER"; mustChangePassword: boolean };
type Activity = { id: string; actorName: string; detail: string; createdAt: string };
type SearchResult = { type: string; id: string; label: string; hint: string; href: string };

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/workspaces", label: "Workspaces", icon: WorkspaceIcon },
  { href: "/scheduler", label: "GPU Scheduler", icon: GpuIcon },
  { href: "/users", label: "User management", icon: UsersIcon, admin: true },
  { href: "/activity", label: "Activity Logs", icon: ActivityIcon },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [openBell, setOpenBell] = useState(false);
  const [openUser, setOpenUser] = useState(false);

  useEffect(() => {
    void api<{ user: Me }>("/api/auth/me")
      .then((data) => {
        if (data.user.mustChangePassword) {
          router.replace("/account/password");
          return;
        }
        setMe(data.user);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    void api<{ activity: Activity[] }>("/api/activity?limit=6")
      .then((data) => setActivity(data.activity))
      .catch(() => setActivity([]));
  }, [pathname]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = nav.filter((item) => !item.admin || me?.role === "ADMIN");

  return (
    <div className="min-h-screen bg-[#c9cfd4] p-3 sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[28px] bg-white shadow-panel sm:min-h-[calc(100vh-2rem)]">
        <aside className="hidden w-[248px] shrink-0 flex-col bg-[#0f172b] text-white md:flex">
          <div className="flex items-center gap-3 px-4 pb-6 pt-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
              <LogoMark className="h-11 w-11" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold tracking-tight">CReMS</span>
              <span className="block text-[10px] leading-tight text-[#9aa3b5]">Compute Resources Management System</span>
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-[#00968a] text-white" : "text-[#d5d8e2] hover:bg-white/5"
                  }`}
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-4 border-b border-[#eef0f3] px-4 py-4 sm:px-6">
            <div className="relative hidden max-w-xl flex-1 lg:block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a8]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workspaces, users, or jobs..."
                className="w-full rounded-xl bg-[#f3f3f5] py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-[#a0a4ab]"
              />
              {results.length > 0 ? (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#eceef2] bg-white shadow-panel">
                  {results.map((result) => (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.href}
                      onClick={() => {
                        setQuery("");
                        setResults([]);
                      }}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-[#f6fbfa]"
                    >
                      <span className="font-medium text-[#17181c]">{result.label}</span>
                      <span className="text-xs text-[#8b9098]">{result.hint}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpenBell((value) => !value);
                    setOpenUser(false);
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#e6e8ee] text-[#4b5160]"
                  aria-label="Notifications"
                >
                  <BellIcon className="h-[18px] w-[18px]" />
                  {activity.length > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ef4444]" /> : null}
                </button>
                {openBell ? (
                  <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-[#eceef2] bg-white p-2 shadow-panel">
                    {activity.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-[#8b9098]">No activity yet.</p>
                    ) : (
                      activity.map((entry) => (
                        <div key={entry.id} className="rounded-xl px-3 py-2.5 hover:bg-[#f7f8fa]">
                          <p className="text-sm font-medium text-[#17181c]">{entry.actorName}</p>
                          <p className="text-xs leading-5 text-[#8b9098]">{entry.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <button type="button" onClick={() => { setOpenUser((value) => !value); setOpenBell(false); }} className="flex items-center gap-3 text-left">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef2f6] text-sm font-semibold text-[#334155]">
                    {(me?.name || "A").slice(0, 1)}
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-sm font-semibold leading-4 text-[#17181c]">{me?.name || "Loading"}</span>
                    <span className="text-xs text-[#8b9098]">{me ? roleLabel(me.role) : ""}</span>
                  </span>
                </button>
                {openUser ? (
                  <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-[#eceef2] bg-white p-2 shadow-panel">
                    <p className="px-3 py-2 text-xs text-[#8b9098]">@{me?.username}</p>
                    <button type="button" onClick={() => void signOut()} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-[#f6f7f9]">
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <div className="flex gap-2 overflow-x-auto border-b border-[#f2f3f5] px-4 py-2 md:hidden">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${pathname.startsWith(item.href) ? "bg-[#00968a] text-white" : "bg-[#f3f4f6] text-[#3c4250]"}`}>
                {item.label}
              </Link>
            ))}
          </div>
          <main className="flex-1 overflow-auto px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

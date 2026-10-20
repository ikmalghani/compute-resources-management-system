export const MB_PER_GB = 1024;

export function mbToGb(memoryMb: number) {
  return Math.max(0, memoryMb) / MB_PER_GB;
}

export function gbToMb(memoryGb: number) {
  return Math.round(Math.max(0, memoryGb) * MB_PER_GB);
}

export function formatRam(memoryMb: number) {
  const gb = mbToGb(memoryMb);
  const label = Number.isInteger(gb) ? String(gb) : gb.toFixed(gb >= 10 ? 1 : 2).replace(/\.?0+$/, "");
  return `${label} GB`;
}

export function formatCpu(cpu: number) {
  const value = Number.isInteger(cpu) ? String(cpu) : String(Math.round(cpu * 100) / 100);
  return `${value} CPU${cpu === 1 ? "" : "s"}`;
}

export function formatCores(cpu: number) {
  const value = Number.isInteger(cpu) ? String(cpu) : String(Math.round(cpu * 100) / 100);
  return `${value} core${cpu === 1 ? "" : "s"}`;
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function roleLabel(role: string) {
  return role === "ADMIN" ? "administrator" : "member";
}

export function shellPreview(username: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "ws";
  return `${username}@crems-${slug}~:$`;
}

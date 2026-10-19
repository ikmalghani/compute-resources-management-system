export function formatRam(memoryMb: number) {
  if (memoryMb >= 1024) {
    const gb = memoryMb / 1024;
    const label = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${label} GB`;
  }
  return `${memoryMb} MB`;
}

export function formatCpu(cpu: number) {
  const value = Number.isInteger(cpu) ? String(cpu) : String(Math.round(cpu * 100) / 100);
  return `${value} CPU${cpu === 1 ? "" : "s"}`;
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
  return `${username}@myspace-${slug}~:$`;
}

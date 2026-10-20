import { inspectHost } from "@/lib/docker";
import { prisma } from "@/lib/db";

function roundCpu(value: number) {
  return Math.round(value * 100) / 100;
}

export async function workspaceHostStats() {
  const host = await inspectHost();
  const running = await prisma.workspace.aggregate({
    where: { status: "RUNNING" },
    _sum: { cpu: true, memoryMb: true },
  });
  const cpuAllocated = roundCpu(running._sum.cpu ?? 0);
  const ramAllocatedMb = running._sum.memoryMb ?? 0;
  const ramTotalMb = Math.floor(host.ramBytes / (1024 * 1024));
  return {
    hostname: host.hostname,
    operatingSystem: host.operatingSystem,
    architecture: host.architecture,
    cpuCores: host.cpuCores,
    cpuAllocated,
    cpuAvailable: Math.max(0, roundCpu(host.cpuCores - cpuAllocated)),
    ramTotalMb,
    ramAllocatedMb,
    ramAvailableMb: Math.max(0, ramTotalMb - ramAllocatedMb),
  };
}

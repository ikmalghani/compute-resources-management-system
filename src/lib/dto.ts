import type { ActivityLog, GpuDevice, GpuJob, User, Workspace } from "@prisma/client";
import { inspectCodePort, inspectLimits } from "@/lib/docker";
import { shellPrompt } from "@/lib/prompt";
import type { Actor } from "@/lib/queries";

type Owner = Pick<User, "id" | "name" | "username">;

export function toUser(
  user: Pick<User, "id" | "name" | "username" | "role" | "status" | "mustChangePassword" | "createdAt">,
) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

type WorkspaceShape = Workspace & {
  owner: Owner | null;
  gpuDevice: Pick<GpuDevice, "id" | "index" | "name"> | null;
  jobs?: Pick<GpuJob, "id" | "title" | "status">[];
};

export async function toWorkspace(workspace: WorkspaceShape, withInspect = false) {
  let enforced: { cpu: number; memoryMb: number; running: boolean } | null = null;
  let codePort: number | null = null;
  if (withInspect && workspace.containerId) {
    try {
      enforced = await inspectLimits(workspace.containerId);
    } catch {
      enforced = null;
    }
    codePort = await inspectCodePort(workspace.containerId);
  }
  const username = workspace.owner?.username ?? "pending";
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    cpu: workspace.cpu,
    memoryMb: workspace.memoryMb,
    status: workspace.status,
    gpuMode: workspace.gpuMode,
    lastError: workspace.lastError,
    prompt: shellPrompt(username, workspace.slug),
    containerName: workspace.containerName,
    codePort,
    owner: workspace.owner
      ? { id: workspace.owner.id, name: workspace.owner.name, username: workspace.owner.username }
      : null,
    gpu: workspace.gpuDevice
      ? { id: workspace.gpuDevice.id, index: workspace.gpuDevice.index, name: workspace.gpuDevice.name }
      : null,
    activeJob: workspace.jobs?.[0]
      ? { id: workspace.jobs[0].id, title: workspace.jobs[0].title, status: workspace.jobs[0].status }
      : null,
    enforced,
    createdAt: workspace.createdAt.toISOString(),
  };
}

type JobShape = GpuJob & {
  workspace: Workspace & { owner: Owner | null };
  requestedBy: Owner | null;
};

export function toJob(job: JobShape, actor: Actor, position: number | null) {
  const visible = actor.role === "ADMIN" || job.workspace.ownerId === actor.id || job.requestedById === actor.id;
  const username = job.workspace.owner?.username ?? "pending";
  return {
    id: job.id,
    title: job.title,
    command: visible ? job.command : "",
    output: visible ? job.output : "",
    status: job.status,
    error: job.error,
    position,
    gpuDeviceId: job.gpuDeviceId,
    workspace: {
      id: job.workspace.id,
      name: job.workspace.name,
      slug: job.workspace.slug,
      gpuMode: job.workspace.gpuMode,
      prompt: shellPrompt(username, job.workspace.slug),
    },
    requestedBy: job.requestedBy
      ? { id: job.requestedBy.id, name: job.requestedBy.name, username: job.requestedBy.username }
      : null,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export function withQueuePositions<T extends { status: string }>(jobs: T[]) {
  let position = 0;
  return jobs.map((job) => ({
    job,
    position: job.status === "QUEUED" ? ++position : null,
  }));
}

export function toGpu(
  device: GpuDevice & { workspace: Pick<Workspace, "id" | "name" | "slug" | "gpuMode"> | null },
) {
  return {
    id: device.id,
    index: device.index,
    name: device.name,
    memoryMb: device.memoryMb,
    status: device.status,
    workspace: device.workspace
      ? {
          id: device.workspace.id,
          name: device.workspace.name,
          slug: device.workspace.slug,
          gpuMode: device.workspace.gpuMode,
        }
      : null,
  };
}

export function toActivity(entry: ActivityLog) {
  return {
    id: entry.id,
    actorName: entry.actorName,
    action: entry.action,
    targetType: entry.targetType,
    targetLabel: entry.targetLabel,
    detail: entry.detail,
    createdAt: entry.createdAt.toISOString(),
  };
}

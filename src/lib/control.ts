import type { GpuDevice, GpuJob, Workspace } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import {
  detectNvidiaGpus,
  execCommand,
  inspectLimits,
  provisionContainer,
  removeWorkspaceRuntime,
  stopContainer,
  updateContainerLimits,
  type GpuAttachMode,
} from "@/lib/docker";
import { HttpError, messageOf } from "@/lib/errors";
import { commandNeedsGpu, GPU_REQUEST_MESSAGE } from "@/lib/gpu-command";
import { withLock } from "@/lib/lock";
import { shellPrompt, slugify } from "@/lib/prompt";
import { jobInclude, workspaceInclude, type Actor } from "@/lib/queries";

type WorkspaceRuntime = Workspace & {
  owner: { id: string; username: string; name: string; status: string } | null;
  gpuDevice: GpuDevice | null;
};

type QueuedJob = GpuJob & { workspace: WorkspaceRuntime };

function adminOnly(actor: Actor) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Only an administrator can do that");
}

function canUseWorkspace(actor: Actor, workspace: { ownerId: string | null }) {
  if (actor.role === "ADMIN") return;
  if (workspace.ownerId !== actor.id) {
    throw new HttpError(403, "This workspace is assigned to another account");
  }
}

function canManageJob(actor: Actor, job: { requestedById: string | null; workspace: { ownerId: string | null } }) {
  if (actor.role === "ADMIN") return;
  if (job.workspace.ownerId === actor.id || job.requestedById === actor.id) return;
  throw new HttpError(403, "You cannot change this job");
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    const suffix = String(n++);
    slug = `${base.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
  }
  return slug;
}

async function loadWorkspace(id: string) {
  return prisma.workspace.findUnique({
    where: { id },
    include: { owner: true, gpuDevice: true },
  });
}

async function attachGpu(ws: { id: string; slug: string; cpu: number; memoryMb: number }, gpuIndex: number, username: string) {
  try {
    const created = await provisionContainer({
      workspaceId: ws.id,
      slug: ws.slug,
      username,
      cpu: ws.cpu,
      memoryMb: ws.memoryMb,
      gpuIndex,
      gpuMode: "nvidia",
    });
    const probe = await execCommand(created.id, "nvidia-smi -L || nvidia-smi", username, 8000);
    const visible = `${probe.stdout}\n${probe.stderr}`;
    if (probe.exitCode === 0 && /gpu/i.test(visible)) {
      return { ...created, mode: "NVIDIA" as const };
    }
    throw new Error(probe.stderr.trim() || "NVIDIA GPU was not visible inside the container");
  } catch (error) {
    console.warn(`[gpu] NVIDIA attach failed for ${ws.slug}: ${messageOf(error)}`);
  }

  const created = await provisionContainer({
    workspaceId: ws.id,
    slug: ws.slug,
    username,
    cpu: ws.cpu,
    memoryMb: ws.memoryMb,
    gpuIndex,
    gpuMode: "simulated",
  });
  return { ...created, mode: "SIMULATED" as const };
}

async function restorePlainContainer(ws: { id: string; slug: string; cpu: number; memoryMb: number; owner: { username: string } | null }) {
  if (!ws.owner) return;
  const created = await provisionContainer({
    workspaceId: ws.id,
    slug: ws.slug,
    username: ws.owner.username,
    cpu: ws.cpu,
    memoryMb: ws.memoryMb,
    gpuIndex: null,
    gpuMode: "none",
  });
  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      containerId: created.id,
      containerName: created.name,
      gpuDeviceId: null,
      gpuMode: "NONE",
      status: "RUNNING",
      lastError: null,
    },
  });
}

async function healLocked() {
  const devices = await prisma.gpuDevice.findMany({
    include: {
      workspace: {
        include: {
          owner: true,
          jobs: { where: { status: "RUNNING" } },
        },
      },
    },
  });

  for (const device of devices) {
    if (device.status !== "BUSY") continue;
    const ws = device.workspace;
    if (ws && ws.jobs.length > 0) continue;
    if (ws?.owner && ws.status === "RUNNING") {
      try {
        await restorePlainContainer(ws);
      } catch (error) {
        console.warn(`[gpu] could not detach GPU ${device.index}: ${messageOf(error)}`);
        await prisma.workspace.update({
          where: { id: ws.id },
          data: { gpuDeviceId: null, gpuMode: "NONE", status: "ERROR", lastError: messageOf(error) },
        });
      }
    } else if (ws) {
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { gpuDeviceId: null, gpuMode: "NONE" },
      });
    }
    await prisma.gpuDevice.update({ where: { id: device.id }, data: { status: "FREE" } });
  }

  const workspaces = await prisma.workspace.findMany();
  for (const ws of workspaces) {
    if (!ws.containerId || ws.status === "PROVISIONING") continue;
    try {
      const info = await inspectLimits(ws.containerId);
      const status = info.running ? "RUNNING" : "STOPPED";
      if (ws.status !== "ERROR" && ws.status !== status) {
        await prisma.workspace.update({ where: { id: ws.id }, data: { status } });
      }
    } catch (error) {
      if (ws.status !== "ERROR" && /no such container/i.test(messageOf(error))) {
        await prisma.workspace.update({
          where: { id: ws.id },
          data: { status: "STOPPED", containerId: null },
        });
      }
    }
  }
}

async function assignGpuLocked(job: QueuedJob, gpu: GpuDevice) {
  const ws = job.workspace;
  if (!ws.owner) return false;
  try {
    const attached = await attachGpu(ws, gpu.index, ws.owner.username);
    await prisma.$transaction([
      prisma.gpuDevice.update({ where: { id: gpu.id }, data: { status: "BUSY" } }),
      prisma.workspace.update({
        where: { id: ws.id },
        data: {
          gpuDeviceId: gpu.id,
          gpuMode: attached.mode,
          containerId: attached.id,
          containerName: attached.name,
          status: "RUNNING",
          lastError: null,
        },
      }),
      prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: "RUNNING", startedAt: new Date(), gpuDeviceId: gpu.id, error: null },
      }),
    ]);
    await logActivity({
      actorName: "Scheduler",
      action: "gpu.assigned",
      targetType: "workspace",
      targetLabel: ws.name,
      detail: `GPU ${gpu.index} is attached to ${ws.slug} (${attached.mode === "NVIDIA" ? "NVIDIA device" : "simulated device"}) for “${job.title}”.`,
    });
    console.info(`[gpu] GPU ${gpu.index} -> ${ws.slug} (${attached.mode}) for ${job.title}`);
    return true;
  } catch (error) {
    const reason = messageOf(error);
    await prisma.gpuJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: reason },
    });
    await prisma.gpuDevice.update({ where: { id: gpu.id }, data: { status: "FREE" } }).catch(() => undefined);
    try {
      await restorePlainContainer(ws);
    } catch (restoreError) {
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { status: "ERROR", lastError: messageOf(restoreError), gpuDeviceId: null, gpuMode: "NONE" },
      });
    }
    await logActivity({
      actorName: "Scheduler",
      action: "gpu.failed",
      targetType: "workspace",
      targetLabel: ws.name,
      detail: `Could not attach a GPU for “${job.title}”: ${reason}`,
    });
    return false;
  }
}

async function releaseFlaggedLocked() {
  const held = await prisma.workspace.findMany({
    where: { gpuDeviceId: { not: null }, status: "RUNNING" },
    include: { owner: true, gpuDevice: true },
  });
  for (const ws of held) {
    if (!ws.containerId || !ws.owner) continue;
    const running = await prisma.gpuJob.findMany({ where: { workspaceId: ws.id, status: "RUNNING" } });
    if (running.some((job) => job.command.trim())) continue;
    try {
      const probe = await execCommand(
        ws.containerId,
        "if [ -f /tmp/crems-release-gpu ]; then rm -f /tmp/crems-release-gpu; echo yes; fi",
        "root",
        4000,
        "/",
      );
      if (!probe.stdout.includes("yes")) continue;
      for (const job of running) {
        await prisma.gpuJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", finishedAt: new Date(), output: "Released after a GPU command." },
        });
      }
      await releaseGpuLocked(ws);
    } catch (error) {
      console.warn(`[gpu] could not check ${ws.slug} for release: ${messageOf(error)}`);
    }
  }
}

async function dispatchLocked() {
  await releaseFlaggedLocked();
  await healLocked();
  const kicks: string[] = [];
  const free = await prisma.gpuDevice.findMany({ where: { status: "FREE" }, orderBy: { index: "asc" } });
  const queued = await prisma.gpuJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { workspace: { include: { owner: true, gpuDevice: true } } },
  });
  const running = await prisma.gpuJob.findMany({ where: { status: "RUNNING" }, select: { workspaceId: true } });
  const busyWorkspaces = new Set(running.map((job) => job.workspaceId));
  const pool = [...free];

  for (const job of queued) {
    if (busyWorkspaces.has(job.workspaceId)) continue;
    const ws = job.workspace;
    if (!ws.owner || ws.status !== "RUNNING") continue;

    if (ws.gpuDevice && ws.gpuDevice.status === "BUSY") {
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: "RUNNING", startedAt: new Date(), gpuDeviceId: ws.gpuDevice.id, error: null },
      });
      busyWorkspaces.add(ws.id);
      if (job.command.trim()) kicks.push(job.id);
      continue;
    }

    const gpu = pool.shift();
    if (!gpu) continue;
    const started = await assignGpuLocked(job, gpu);
    if (started) {
      busyWorkspaces.add(ws.id);
      if (job.command.trim()) kicks.push(job.id);
    }
  }

  return kicks;
}

function launch(kicks: string[]) {
  for (const jobId of kicks) void runJobCommand(jobId);
}

async function runJobCommand(jobId: string) {
  const job = await prisma.gpuJob.findUnique({
    where: { id: jobId },
    include: { workspace: { include: { owner: true } } },
  });
  if (!job || job.status !== "RUNNING" || !job.command.trim()) return;
  const username = job.workspace.owner?.username;
  if (!username || !job.workspace.containerId) {
    await finishGpuJob(null, jobId, "FAILED", "Workspace container is not running");
    return;
  }
  try {
    const result = await execCommand(job.workspace.containerId, job.command, username, 15 * 60 * 1000);
    const output = `${result.stdout}${result.stderr}`.slice(-8000);
    if (result.exitCode === 0) await finishGpuJob(null, jobId, "COMPLETED", null, output);
    else await finishGpuJob(null, jobId, "FAILED", `Command exited with ${result.exitCode}`, output);
  } catch (error) {
    await finishGpuJob(null, jobId, "FAILED", messageOf(error));
  }
}

async function releaseGpuLocked(ws: WorkspaceRuntime) {
  if (!ws.gpuDeviceId) return;
  const gpuId = ws.gpuDeviceId;
  if (ws.owner && ws.containerId) {
    try {
      await restorePlainContainer(ws);
    } catch (error) {
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { status: "ERROR", lastError: messageOf(error), gpuDeviceId: null, gpuMode: "NONE" },
      });
    }
  } else {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { gpuDeviceId: null, gpuMode: "NONE" },
    });
  }
  await prisma.gpuDevice.update({ where: { id: gpuId }, data: { status: "FREE" } });
  await logActivity({
    actorName: "Scheduler",
    action: "gpu.released",
    targetType: "workspace",
    targetLabel: ws.name,
    detail: `GPU ${ws.gpuDevice?.index ?? ""} was released from ${ws.slug}.`,
  });
}

export async function tick() {
  let kicks: string[] = [];
  await withLock(async () => {
    kicks = await dispatchLocked();
  });
  launch(kicks);
}

export async function createWorkspace(
  actor: Actor,
  input: { name: string; description?: string; ownerId: string; cpu: number; memoryMb: number },
) {
  adminOnly(actor);
  return withLock(async () => {
    const owner = await prisma.user.findUnique({ where: { id: input.ownerId } });
    if (!owner || owner.status !== "ACTIVE") {
      throw new HttpError(400, "Assign an active user. Grant access before assigning a workspace.");
    }
    const slug = await uniqueSlug(input.name);
    const description =
      input.description?.trim() ||
      `Dedicated compute container for ${owner.name}, with a private home directory and scheduled GPU access.`;
    const createdRow = await prisma.workspace.create({
      data: {
        name: input.name.trim(),
        slug,
        description,
        cpu: input.cpu,
        memoryMb: input.memoryMb,
        ownerId: owner.id,
        status: "PROVISIONING",
      },
    });
    try {
      const container = await provisionContainer({
        workspaceId: createdRow.id,
        slug,
        username: owner.username,
        cpu: input.cpu,
        memoryMb: input.memoryMb,
        gpuIndex: null,
        gpuMode: "none" satisfies GpuAttachMode,
      });
      const workspace = await prisma.workspace.update({
        where: { id: createdRow.id },
        data: {
          status: "RUNNING",
          containerId: container.id,
          containerName: container.name,
          gpuMode: "NONE",
          lastError: null,
        },
        include: workspaceInclude,
      });
      await logActivity({
        actorId: actor.id,
        actorName: actor.name,
        action: "workspace.created",
        targetType: "workspace",
        targetLabel: workspace.name,
        detail: `Created ${container.name} for ${owner.username} with ${input.cpu} CPU and ${input.memoryMb} MB RAM. Shell prompt is ${shellPrompt(owner.username, slug)}.`,
      });
      return workspace;
    } catch (error) {
      await prisma.workspace.update({
        where: { id: createdRow.id },
        data: { status: "ERROR", lastError: messageOf(error) },
      });
      throw new HttpError(500, messageOf(error));
    }
  });
}

export async function updateWorkspace(
  actor: Actor,
  id: string,
  input: { name?: string; description?: string; ownerId?: string; cpu?: number; memoryMb?: number },
) {
  adminOnly(actor);
  return withLock(async () => {
    const existing = await loadWorkspace(id);
    if (!existing) throw new HttpError(404, "Workspace not found");

    let owner = existing.owner;
    if (input.ownerId && input.ownerId !== existing.ownerId) {
      const nextOwner = await prisma.user.findUnique({ where: { id: input.ownerId } });
      if (!nextOwner || nextOwner.status !== "ACTIVE") {
        throw new HttpError(400, "Grant the user access before assigning a workspace.");
      }
      owner = nextOwner;
    }

    const cpu = input.cpu ?? existing.cpu;
    const memoryMb = input.memoryMb ?? existing.memoryMb;
    const ownerChanged = (owner?.id ?? null) !== existing.ownerId;
    const limitsChanged = cpu !== existing.cpu || memoryMb !== existing.memoryMb;

    await prisma.workspace.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        description: input.description !== undefined ? input.description.trim() : existing.description,
        cpu,
        memoryMb,
        ownerId: owner?.id ?? null,
      },
    });

    if (ownerChanged) {
      if (!owner) throw new HttpError(400, "A workspace needs an assigned user");
      if (existing.gpuDevice && existing.gpuMode !== "NONE") {
        const attached = await attachGpu({ id, slug: existing.slug, cpu, memoryMb }, existing.gpuDevice.index, owner.username);
        await prisma.workspace.update({
          where: { id },
          data: {
            containerId: attached.id,
            containerName: attached.name,
            gpuMode: attached.mode,
            status: "RUNNING",
            lastError: null,
          },
        });
      } else {
        const container = await provisionContainer({
          workspaceId: existing.id,
          slug: existing.slug,
          username: owner.username,
          cpu,
          memoryMb,
          gpuIndex: null,
          gpuMode: "none",
        });
        await prisma.workspace.update({
          where: { id },
          data: {
            containerId: container.id,
            containerName: container.name,
            status: "RUNNING",
            lastError: null,
          },
        });
      }
    } else if (limitsChanged && existing.containerId && existing.status !== "PROVISIONING") {
      try {
        await updateContainerLimits(existing.containerId, cpu, memoryMb);
      } catch (error) {
        if (!owner || existing.status !== "RUNNING") throw new HttpError(500, messageOf(error));
        const container = await provisionContainer({
          workspaceId: existing.id,
          slug: existing.slug,
          username: owner.username,
          cpu,
          memoryMb,
          gpuIndex: existing.gpuDevice?.index ?? null,
          gpuMode: existing.gpuMode === "NVIDIA" ? "nvidia" : existing.gpuMode === "SIMULATED" ? "simulated" : "none",
        });
        await prisma.workspace.update({
          where: { id },
          data: { containerId: container.id, containerName: container.name, status: "RUNNING", lastError: null },
        });
      }
    }

    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "workspace.updated",
      targetType: "workspace",
      targetLabel: input.name?.trim() || existing.name,
      detail: `Updated ${existing.slug}: ${cpu} CPU, ${memoryMb} MB RAM${owner ? `, assigned to ${owner.username}` : ""}.`,
    });

    return prisma.workspace.findUniqueOrThrow({ where: { id }, include: workspaceInclude });
  });
}

export async function deleteWorkspace(actor: Actor, id: string) {
  adminOnly(actor);
  let kicks: string[] = [];
  await withLock(async () => {
    const existing = await loadWorkspace(id);
    if (!existing) throw new HttpError(404, "Workspace not found");
    if (existing.gpuDeviceId) {
      await prisma.gpuDevice.update({ where: { id: existing.gpuDeviceId }, data: { status: "FREE" } });
    }
    try {
      await removeWorkspaceRuntime(existing.slug);
    } catch (error) {
      console.warn(`[workspace] cleanup failed for ${existing.slug}: ${messageOf(error)}`);
    }
    await prisma.workspace.delete({ where: { id } });
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "workspace.deleted",
      targetType: "workspace",
      targetLabel: existing.name,
      detail: `Deleted workspace ${existing.slug} and removed its container.`,
    });
    kicks = await dispatchLocked();
  });
  launch(kicks);
}

export async function setWorkspacePower(actor: Actor, id: string, action: "start" | "stop" | "retry") {
  adminOnly(actor);
  let kicks: string[] = [];
  const workspace = await withLock(async () => {
    const existing = await loadWorkspace(id);
    if (!existing) throw new HttpError(404, "Workspace not found");

    if (action === "stop") {
      await prisma.gpuJob.updateMany({
        where: { workspaceId: id, status: "RUNNING" },
        data: { status: "CANCELLED", finishedAt: new Date(), error: "Workspace stopped" },
      });
      if (existing.gpuDeviceId) {
        await prisma.gpuDevice.update({ where: { id: existing.gpuDeviceId }, data: { status: "FREE" } });
        await prisma.workspace.update({
          where: { id },
          data: { gpuDeviceId: null, gpuMode: "NONE" },
        });
      }
      if (existing.containerId) await stopContainer(existing.containerId);
      await prisma.workspace.update({ where: { id }, data: { status: "STOPPED" } });
      await logActivity({
        actorId: actor.id,
        actorName: actor.name,
        action: "workspace.stopped",
        targetType: "workspace",
        targetLabel: existing.name,
        detail: `Stopped ${existing.containerName ?? existing.slug}.`,
      });
      kicks = await dispatchLocked();
      return prisma.workspace.findUniqueOrThrow({ where: { id }, include: workspaceInclude });
    }

    if (!existing.owner) throw new HttpError(400, "Assign a user before starting this workspace");
    await prisma.gpuJob.updateMany({
      where: { workspaceId: id, status: "RUNNING" },
      data: { status: "CANCELLED", finishedAt: new Date(), error: "Workspace restarted" },
    });
    if (existing.gpuDeviceId) {
      await prisma.gpuDevice.update({ where: { id: existing.gpuDeviceId }, data: { status: "FREE" } });
    }
    const container = await provisionContainer({
      workspaceId: existing.id,
      slug: existing.slug,
      username: existing.owner.username,
      cpu: existing.cpu,
      memoryMb: existing.memoryMb,
      gpuIndex: null,
      gpuMode: "none",
    });
    await prisma.workspace.update({
      where: { id },
      data: {
        status: "RUNNING",
        containerId: container.id,
        containerName: container.name,
        gpuDeviceId: null,
        gpuMode: "NONE",
        lastError: null,
      },
    });
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: action === "retry" ? "workspace.retried" : "workspace.started",
      targetType: "workspace",
      targetLabel: existing.name,
      detail: `${action === "retry" ? "Retried" : "Started"} ${container.name} as ${existing.owner.username}.`,
    });
    kicks = await dispatchLocked();
    return prisma.workspace.findUniqueOrThrow({ where: { id }, include: workspaceInclude });
  });
  launch(kicks);
  return workspace;
}

export async function enqueueGpuJob(actor: Actor, input: { workspaceId: string; title: string; command?: string }) {
  let kicks: string[] = [];
  let jobId = "";
  await withLock(async () => {
    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId } });
    if (!workspace) throw new HttpError(404, "Workspace not found");
    canUseWorkspace(actor, workspace);
    if (workspace.status !== "RUNNING") {
      throw new HttpError(400, "Start the workspace before queueing a GPU job");
    }
    const job = await prisma.gpuJob.create({
      data: {
        title: input.title.trim(),
        command: input.command?.trim() || "",
        workspaceId: workspace.id,
        requestedById: actor.id,
        status: "QUEUED",
      },
    });
    jobId = job.id;
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "gpu.queued",
      targetType: "job",
      targetLabel: job.title,
      detail: `Queued “${job.title}” on ${workspace.name}.`,
    });
    kicks = await dispatchLocked();
  });
  launch(kicks);
  return prisma.gpuJob.findUniqueOrThrow({ where: { id: jobId }, include: jobInclude });
}

export async function finishGpuJob(
  actor: Actor | null,
  jobId: string,
  status: "COMPLETED" | "FAILED" | "CANCELLED",
  error?: string | null,
  output?: string,
) {
  let kicks: string[] = [];
  await withLock(async () => {
    const job = await prisma.gpuJob.findUnique({
      where: { id: jobId },
      include: { workspace: { include: { owner: true, gpuDevice: true } } },
    });
    if (!job) throw new HttpError(404, "Job not found");
    if (actor) canManageJob(actor, job);

    if (job.status === "QUEUED") {
      if (status !== "CANCELLED") {
        throw new HttpError(400, "A queued job can be cancelled. It runs when a GPU is free.");
      }
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: "CANCELLED", finishedAt: new Date(), error: error ?? "Cancelled" },
      });
      await logActivity({
        actorId: actor?.id,
        actorName: actor?.name ?? "Scheduler",
        action: "gpu.cancelled",
        targetType: "job",
        targetLabel: job.title,
        detail: `Cancelled queued job “${job.title}”.`,
      });
      return;
    }

    if (job.status !== "RUNNING") return;

    await prisma.gpuJob.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt: new Date(),
        error: error ?? null,
        output: output ?? job.output,
      },
    });

    const ws = job.workspace;
    const queued = await prisma.gpuJob.findMany({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    const runningRows = await prisma.gpuJob.findMany({
      where: { status: "RUNNING" },
      select: { workspaceId: true },
    });
    const runningWorkspaces = new Set(runningRows.map((item) => item.workspaceId));
    const next = queued.find((item) => !runningWorkspaces.has(item.workspaceId));
    const keep = Boolean(next && next.workspaceId === ws.id && ws.gpuDeviceId);

    if (keep && next && ws.gpuDeviceId) {
      await prisma.gpuJob.update({
        where: { id: next.id },
        data: { status: "RUNNING", startedAt: new Date(), gpuDeviceId: ws.gpuDeviceId, error: null },
      });
      if (next.command.trim()) kicks.push(next.id);
      await logActivity({
        actorName: "Scheduler",
        action: "gpu.continued",
        targetType: "workspace",
        targetLabel: ws.name,
        detail: `GPU ${ws.gpuDevice?.index ?? ""} stayed on ${ws.slug} for “${next.title}”.`,
      });
    } else if (ws.gpuDeviceId) {
      await releaseGpuLocked(ws);
    }

    await logActivity({
      actorId: actor?.id,
      actorName: actor?.name ?? "Scheduler",
      action: `gpu.${status.toLowerCase()}`,
      targetType: "job",
      targetLabel: job.title,
      detail: `Job “${job.title}” is ${status.toLowerCase()}${error ? `: ${error}` : "."}`,
    });

    kicks.push(...(await dispatchLocked()));
  });
  launch(kicks);
}

async function releaseAfterGpuCommand(workspaceId: string) {
  let kicks: string[] = [];
  await withLock(async () => {
    const ws = await loadWorkspace(workspaceId);
    if (!ws?.gpuDeviceId) return;
    const running = await prisma.gpuJob.findMany({ where: { workspaceId, status: "RUNNING" } });
    if (running.some((job) => job.command.trim())) return;
    for (const job of running) {
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", finishedAt: new Date(), output: "Released after a GPU command." },
      });
    }
    await releaseGpuLocked(ws);
    kicks = await dispatchLocked();
  });
  launch(kicks);
}

export async function execInWorkspace(actor: Actor, workspaceId: string, command: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { owner: true, jobs: { where: { status: { in: ["QUEUED", "RUNNING"] } }, take: 1 } },
  });
  if (!workspace) throw new HttpError(404, "Workspace not found");
  canUseWorkspace(actor, workspace);
  if (!workspace.owner || !workspace.containerId || workspace.status !== "RUNNING") {
    throw new HttpError(400, "The workspace container is not running");
  }
  const prompt = shellPrompt(workspace.owner.username, workspace.slug);
  const needsGpu = commandNeedsGpu(command);
  if (needsGpu && !workspace.gpuDeviceId) {
    return {
      prompt,
      stdout: "",
      stderr: `${GPU_REQUEST_MESSAGE}\n`,
      exitCode: 1,
      needsGpu: true,
    };
  }
  const result = await execCommand(workspace.containerId, command, workspace.owner.username, 20000);
  if (needsGpu) await releaseAfterGpuCommand(workspace.id);
  return { prompt, ...result, needsGpu };
}

export async function requestGpu(actor: Actor, workspaceId: string) {
  let kicks: string[] = [];
  let state: "attached" | "queued" = "queued";
  await withLock(async () => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { jobs: { where: { status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!workspace) throw new HttpError(404, "Workspace not found");
    canUseWorkspace(actor, workspace);
    if (workspace.status !== "RUNNING") throw new HttpError(400, "Start the workspace before requesting a GPU");
    const current = workspace.jobs[0];
    if (current?.status === "RUNNING") {
      state = "attached";
      return;
    }
    if (current?.status === "QUEUED") {
      state = "queued";
      return;
    }
    await prisma.gpuJob.create({
      data: {
        title: "GPU request",
        command: "",
        workspaceId: workspace.id,
        requestedById: actor.id,
        status: "QUEUED",
      },
    });
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "gpu.queued",
      targetType: "job",
      targetLabel: "GPU request",
      detail: `Requested a GPU for ${workspace.name}. It attaches when one is free, and releases after the next GPU command.`,
    });
    kicks = await dispatchLocked();
    const now = await prisma.gpuJob.findFirst({
      where: { workspaceId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    state = now?.status === "RUNNING" ? "attached" : "queued";
  });
  launch(kicks);
  return { state };
}

export async function scanHostGpus(actor: Actor) {
  adminOnly(actor);
  const found = await detectNvidiaGpus();
  const registered = await prisma.gpuDevice.findMany({ select: { index: true } });
  const inPool = new Set(registered.map((device) => device.index));
  return found.map((gpu) => ({
    index: gpu.index,
    name: gpu.name,
    memoryMb: gpu.memoryMb,
    inPool: inPool.has(gpu.index),
  }));
}

export async function addGpuDevices(actor: Actor, gpus: { name: string; memoryMb: number; index: number }[]) {
  adminOnly(actor);
  let kicks: string[] = [];
  const created = await withLock(async () => {
    const devices = [];
    for (const gpu of gpus) {
      const taken = await prisma.gpuDevice.findUnique({ where: { index: gpu.index } });
      if (taken) throw new HttpError(409, `GPU index ${gpu.index} is already registered`);
      const device = await prisma.gpuDevice.create({
        data: { index: gpu.index, name: gpu.name.trim(), memoryMb: gpu.memoryMb, status: "FREE" },
      });
      devices.push(device);
      await logActivity({
        actorId: actor.id,
        actorName: actor.name,
        action: "gpu.added",
        targetType: "gpu",
        targetLabel: device.name,
        detail: `Registered GPU ${device.index} (${device.memoryMb} MB) in the scheduler pool.`,
      });
    }
    kicks = await dispatchLocked();
    return devices;
  });
  launch(kicks);
  return created;
}

export async function removeGpuDevice(actor: Actor, id: string) {
  adminOnly(actor);
  await withLock(async () => {
    const device = await prisma.gpuDevice.findUnique({ where: { id } });
    if (!device) throw new HttpError(404, "GPU not found");
    if (device.status !== "FREE") throw new HttpError(400, "Release this GPU before removing it");
    await prisma.gpuDevice.delete({ where: { id } });
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "gpu.removed",
      targetType: "gpu",
      targetLabel: device.name,
      detail: `Removed GPU ${device.index} from the scheduler pool.`,
    });
  });
}

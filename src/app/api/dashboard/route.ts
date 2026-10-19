import { requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toActivity, toGpu, toJob, toWorkspace, withQueuePositions } from "@/lib/dto";
import { handle, ok } from "@/lib/http";
import { jobInclude, workspaceInclude } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireReadyUser();
    const workspaceWhere = actor.role === "ADMIN" ? {} : { ownerId: actor.id };
    const [workspaces, users, gpus, jobs, activity] = await Promise.all([
      prisma.workspace.findMany({
        where: workspaceWhere,
        include: workspaceInclude,
        orderBy: { createdAt: "desc" },
      }),
      actor.role === "ADMIN" ? prisma.user.count() : Promise.resolve(1),
      prisma.gpuDevice.findMany({ include: { workspace: true }, orderBy: { index: "asc" } }),
      prisma.gpuJob.findMany({
        where: actor.role === "ADMIN" ? { status: { in: ["QUEUED", "RUNNING"] } } : { workspace: { ownerId: actor.id }, status: { in: ["QUEUED", "RUNNING"] } },
        include: jobInclude,
        orderBy: { createdAt: "asc" },
        take: 8,
      }),
      prisma.activityLog.findMany({
        where: actor.role === "ADMIN" ? {} : { actorId: actor.id },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);
    const positioned = withQueuePositions(jobs);
    return ok({
      stats: {
        workspaces: workspaces.length,
        running: workspaces.filter((workspace) => workspace.status === "RUNNING").length,
        users,
        queued: jobs.filter((job) => job.status === "QUEUED").length,
        gpus: gpus.length,
        busy: gpus.filter((gpu) => gpu.status === "BUSY").length,
      },
      workspaces: await Promise.all(workspaces.slice(0, 6).map((workspace) => toWorkspace(workspace))),
      gpus: gpus.map(toGpu),
      jobs: positioned.map(({ job, position }) => toJob(job, actor, position)),
      activity: activity.map(toActivity),
    });
  } catch (error) {
    return handle(error);
  }
}

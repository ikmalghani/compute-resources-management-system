import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";

export type Actor = Pick<User, "id" | "name" | "role" | "username">;

export const workspaceInclude = {
  owner: true,
  gpuDevice: true,
  jobs: {
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "asc" },
    take: 1,
  },
} satisfies Prisma.WorkspaceInclude;

export const jobInclude = {
  workspace: { include: { owner: true, gpuDevice: true } },
  requestedBy: true,
} satisfies Prisma.GpuJobInclude;

export async function listWorkspaces(actor: Actor) {
  return prisma.workspace.findMany({
    where: actor.role === "ADMIN" ? {} : { ownerId: actor.id },
    include: workspaceInclude,
    orderBy: { createdAt: "desc" },
  });
}

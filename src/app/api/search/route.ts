import { requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireReadyUser();
    const q = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (q.length < 1) return ok({ results: [] });

    const workspaceWhere =
      actor.role === "ADMIN"
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
              { owner: { username: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {
            ownerId: actor.id,
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
            ],
          };

    const [workspaces, users, jobs] = await Promise.all([
      prisma.workspace.findMany({ where: workspaceWhere, include: { owner: true }, take: 6 }),
      actor.role === "ADMIN"
        ? prisma.user.findMany({
            where: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 5,
          })
        : Promise.resolve([]),
      prisma.gpuJob.findMany({
        where: {
          title: { contains: q, mode: "insensitive" },
          ...(actor.role === "ADMIN" ? {} : { workspace: { ownerId: actor.id } }),
        },
        include: { workspace: true },
        take: 5,
      }),
    ]);

    return ok({
      results: [
        ...workspaces.map((workspace) => ({
          type: "workspace" as const,
          id: workspace.id,
          label: workspace.name,
          hint: workspace.owner ? `@${workspace.owner.username}` : "Unassigned",
          href: `/workspaces/${workspace.id}`,
        })),
        ...users.map((user) => ({
          type: "user" as const,
          id: user.id,
          label: user.name,
          hint: `@${user.username}`,
          href: "/users",
        })),
        ...jobs.map((job) => ({
          type: "job" as const,
          id: job.id,
          label: job.title,
          hint: job.workspace.name,
          href: "/scheduler",
        })),
      ],
    });
  } catch (error) {
    return handle(error);
  }
}

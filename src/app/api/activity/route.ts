import { requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toActivity } from "@/lib/dto";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireReadyUser();
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") || 40), 100);
    const entries = await prisma.activityLog.findMany({
      where: actor.role === "ADMIN" ? {} : { actorId: actor.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({ activity: entries.map(toActivity) });
  } catch (error) {
    return handle(error);
  }
}

import { requireReadyUser } from "@/lib/auth";
import { finishGpuJob } from "@/lib/control";
import { prisma } from "@/lib/db";
import { toJob } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { handle, ok, readJson } from "@/lib/http";
import { jobInclude } from "@/lib/queries";
import { finishJobSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const input = finishJobSchema.parse(await readJson(request));
    await finishGpuJob(actor, id, input.action === "complete" ? "COMPLETED" : "CANCELLED");
    const job = await prisma.gpuJob.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw new HttpError(404, "Job not found");
    return ok({ job: toJob(job, actor, null) });
  } catch (error) {
    return handle(error);
  }
}

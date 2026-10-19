import { requireReadyUser } from "@/lib/auth";
import { enqueueGpuJob } from "@/lib/control";
import { toJob } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { gpuJobSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireReadyUser();
    const input = gpuJobSchema.parse(await readJson(request));
    const job = await enqueueGpuJob(actor, input);
    return ok({ job: toJob(job, actor, job.status === "QUEUED" ? 1 : null) }, 201);
  } catch (error) {
    return handle(error);
  }
}

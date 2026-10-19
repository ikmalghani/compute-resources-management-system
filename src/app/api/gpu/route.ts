import { requireAdmin, requireReadyUser } from "@/lib/auth";
import { addGpuDevice } from "@/lib/control";
import { prisma } from "@/lib/db";
import { toGpu, toJob, withQueuePositions } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { jobInclude } from "@/lib/queries";
import { gpuDeviceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireReadyUser();
    const [devices, jobs] = await Promise.all([
      prisma.gpuDevice.findMany({ include: { workspace: true }, orderBy: { index: "asc" } }),
      prisma.gpuJob.findMany({
        where: actor.role === "ADMIN" ? {} : { workspace: { ownerId: actor.id } },
        include: jobInclude,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        take: 100,
      }),
    ]);
    const positioned = withQueuePositions(jobs);
    return ok({
      gpus: devices.map(toGpu),
      jobs: positioned.map(({ job, position }) => toJob(job, actor, position)),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const input = gpuDeviceSchema.parse(await readJson(request));
    const device = await addGpuDevice(actor, input);
    const full = await prisma.gpuDevice.findUniqueOrThrow({ where: { id: device.id }, include: { workspace: true } });
    return ok({ gpu: toGpu(full) }, 201);
  } catch (error) {
    return handle(error);
  }
}

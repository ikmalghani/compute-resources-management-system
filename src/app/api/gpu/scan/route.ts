import { requireAdmin } from "@/lib/auth";
import { scanHostGpus } from "@/lib/control";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdmin();
    const gpus = await scanHostGpus(actor);
    return ok({ gpus });
  } catch (error) {
    return handle(error);
  }
}

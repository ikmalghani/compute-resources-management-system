import { requireReadyUser } from "@/lib/auth";
import { requestGpu } from "@/lib/control";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const result = await requestGpu(actor, id);
    return ok(result);
  } catch (error) {
    return handle(error);
  }
}

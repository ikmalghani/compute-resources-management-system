import { requireAdmin } from "@/lib/auth";
import { removeGpuDevice } from "@/lib/control";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    await removeGpuDevice(actor, id);
    return ok({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

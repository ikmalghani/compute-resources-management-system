import { rotatePassword } from "@/lib/accounts";
import { requireAdmin } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const result = await rotatePassword(actor, id);
    return ok(result);
  } catch (error) {
    return handle(error);
  }
}

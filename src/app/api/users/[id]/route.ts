import { deleteAccount, updateAccount } from "@/lib/accounts";
import { requireAdmin } from "@/lib/auth";
import { toUser } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { updateUserSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const input = updateUserSchema.parse(await readJson(request));
    const user = await updateAccount(actor, id, input);
    return ok({ user: toUser(user) });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireAdmin();
    const { id } = await context.params;
    await deleteAccount(actor, id);
    return ok({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

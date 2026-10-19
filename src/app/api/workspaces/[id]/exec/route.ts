import { requireReadyUser } from "@/lib/auth";
import { execInWorkspace } from "@/lib/control";
import { handle, ok, readJson } from "@/lib/http";
import { execSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const input = execSchema.parse(await readJson(request));
    const result = await execInWorkspace(actor, id, input.command);
    return ok(result);
  } catch (error) {
    return handle(error);
  }
}

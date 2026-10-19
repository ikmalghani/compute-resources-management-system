import { requireReadyUser } from "@/lib/auth";
import { setWorkspacePower } from "@/lib/control";
import { toWorkspace } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { powerSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const input = powerSchema.parse(await readJson(request));
    const workspace = await setWorkspacePower(actor, id, input.action);
    return ok({ workspace: await toWorkspace(workspace, true) });
  } catch (error) {
    return handle(error);
  }
}

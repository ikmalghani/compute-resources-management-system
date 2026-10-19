import { requireReadyUser } from "@/lib/auth";
import { createWorkspace } from "@/lib/control";
import { toWorkspace } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { listWorkspaces } from "@/lib/queries";
import { createWorkspaceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireReadyUser();
    const workspaces = await listWorkspaces(actor);
    return ok({ workspaces: await Promise.all(workspaces.map((workspace) => toWorkspace(workspace))) });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireReadyUser();
    const input = createWorkspaceSchema.parse(await readJson(request));
    const workspace = await createWorkspace(actor, input);
    return ok({ workspace: await toWorkspace(workspace, true) }, 201);
  } catch (error) {
    return handle(error);
  }
}

import { requireReadyUser } from "@/lib/auth";
import { deleteWorkspace, updateWorkspace } from "@/lib/control";
import { prisma } from "@/lib/db";
import { toWorkspace } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { handle, ok, readJson } from "@/lib/http";
import { workspaceInclude } from "@/lib/queries";
import { updateWorkspaceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const workspace = await prisma.workspace.findUnique({ where: { id }, include: workspaceInclude });
    if (!workspace) throw new HttpError(404, "Workspace not found");
    if (actor.role !== "ADMIN" && workspace.ownerId !== actor.id) {
      throw new HttpError(403, "This workspace is assigned to another account");
    }
    return ok({ workspace: await toWorkspace(workspace, true) });
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const input = updateWorkspaceSchema.parse(await readJson(request));
    const workspace = await updateWorkspace(actor, id, input);
    return ok({ workspace: await toWorkspace(workspace, true) });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    await deleteWorkspace(actor, id);
    return ok({ ok: true });
  } catch (error) {
    return handle(error);
  }
}

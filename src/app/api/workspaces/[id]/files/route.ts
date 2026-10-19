import { requireReadyUser } from "@/lib/auth";
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceEntry,
  listWorkspaceFiles,
  readWorkspaceFile,
  renameWorkspaceEntry,
  uploadWorkspaceFile,
  writeWorkspaceFile,
} from "@/lib/files";
import { handle, ok, readJson } from "@/lib/http";
import { HttpError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    if (url.searchParams.get("content") === "1") {
      return ok(await readWorkspaceFile(actor, id, path));
    }
    return ok(await listWorkspaceFiles(actor, id, path));
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireReadyUser();
    const { id } = await context.params;
    const type = request.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const parent = String(form.get("path") ?? "");
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload");
      const bytes = Buffer.from(await file.arrayBuffer());
      return ok(await uploadWorkspaceFile(actor, id, parent, file.name, bytes));
    }

    const body = await readJson(request);
    const action = typeof body?.action === "string" ? body.action : "";
    const parent = typeof body?.parent === "string" ? body.parent : "";
    const name = typeof body?.name === "string" ? body.name : "";
    const path = typeof body?.path === "string" ? body.path : "";
    if (action === "mkdir") return ok(await createWorkspaceFolder(actor, id, parent, name));
    if (action === "create") return ok(await createWorkspaceFile(actor, id, parent, name));
    if (action === "write") {
      if (typeof body?.content !== "string") throw new HttpError(400, "File content must be text");
      return ok(await writeWorkspaceFile(actor, id, path, body.content));
    }
    if (action === "rename") return ok(await renameWorkspaceEntry(actor, id, path, name));
    if (action === "delete") return ok(await deleteWorkspaceEntry(actor, id, path));
    throw new HttpError(400, "Unknown file action");
  } catch (error) {
    return handle(error);
  }
}

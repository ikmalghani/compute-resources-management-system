import { requireAdmin } from "@/lib/auth";
import { workspaceHostStats } from "@/lib/host";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return ok({ host: await workspaceHostStats() });
  } catch (error) {
    return handle(error);
  }
}

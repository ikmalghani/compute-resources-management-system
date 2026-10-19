import { requireUser } from "@/lib/auth";
import { toUser } from "@/lib/dto";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ user: toUser(user) });
  } catch (error) {
    return handle(error);
  }
}

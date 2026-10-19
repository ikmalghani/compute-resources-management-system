import { createAccount } from "@/lib/accounts";
import { requireAdmin, requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toUser } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { createUserSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireReadyUser();
    if (actor.role !== "ADMIN") {
      return ok({ users: [toUser(actor)] });
    }
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return ok({ users: users.map(toUser) });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const input = createUserSchema.parse(await readJson(request));
    const { user, temporaryPassword } = await createAccount(actor, input);
    return ok({ user: toUser(user), temporaryPassword }, 201);
  } catch (error) {
    return handle(error);
  }
}

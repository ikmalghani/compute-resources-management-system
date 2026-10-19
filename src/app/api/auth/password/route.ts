import { getCurrentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/accounts";
import { toUser } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { handle, ok, readJson } from "@/lib/http";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const input = changePasswordSchema.parse(await readJson(request));
    const updated = await changeOwnPassword(user.id, input.currentPassword, input.newPassword);
    const token = await signSession(updated);
    const response = ok({ user: toUser(updated) });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return response;
  } catch (error) {
    return handle(error);
  }
}

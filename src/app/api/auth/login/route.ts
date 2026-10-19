import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { toUser } from "@/lib/dto";
import { HttpError } from "@/lib/errors";
import { handle, ok, readJson } from "@/lib/http";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/session";
import { loginSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await readJson(request));
    const user = await prisma.user.findUnique({ where: { username: input.username } });
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid || user.status !== "ACTIVE") {
      throw new HttpError(401, "Invalid username or password");
    }
    const token = await signSession(user);
    await logActivity({
      actorId: user.id,
      actorName: user.name,
      action: "auth.login",
      targetType: "user",
      targetLabel: user.username,
      detail: `${user.name} signed in.`,
    });
    const response = ok({ user: toUser(user) });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return response;
  } catch (error) {
    return handle(error);
  }
}

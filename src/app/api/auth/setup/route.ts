import { bootstrapAdministrator, needsSetup } from "@/lib/accounts";
import { toUser } from "@/lib/dto";
import { handle, ok, readJson } from "@/lib/http";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/session";
import { setupAdminSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ needsSetup: await needsSetup() });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = setupAdminSchema.parse(await readJson(request));
    const user = await bootstrapAdministrator(input);
    const token = await signSession(user);
    const response = ok({ user: toUser(user) }, 201);
    response.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return response;
  } catch (error) {
    return handle(error);
  }
}

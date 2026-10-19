import { cookies } from "next/headers";
import { bootControlPlane } from "@/lib/boot";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export async function getCurrentUser() {
  bootControlPlane();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await readSession(token);
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "ACTIVE") return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

export async function requireReadyUser() {
  const user = await requireUser();
  if (user.mustChangePassword) {
    throw new HttpError(403, "Change your password before continuing");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireReadyUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Only an administrator can do that");
  return user;
}

import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { HttpError, isUniqueConflict } from "@/lib/errors";
import { generatePassword } from "@/lib/passwords";
import type { Actor } from "@/lib/queries";

function adminOnly(actor: Actor) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Only an administrator can do that");
}

async function assertAdminRemains(user: { id: string; role: string; status: string }, next: { role?: string; status?: string }) {
  if (user.role !== "ADMIN" || user.status !== "ACTIVE") return;
  const staysActiveAdmin = (next.role ?? user.role) === "ADMIN" && (next.status ?? user.status) === "ACTIVE";
  if (staysActiveAdmin) return;
  const others = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: user.id } },
  });
  if (others < 1) throw new HttpError(400, "Keep at least one active administrator");
}

export async function createAccount(actor: Actor, input: { name: string; username: string; role: "ADMIN" | "USER" }) {
  adminOnly(actor);
  const temporaryPassword = generatePassword();
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        username: input.username,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        mustChangePassword: true,
        role: input.role,
        status: "ACTIVE",
      },
    });
    await logActivity({
      actorId: actor.id,
      actorName: actor.name,
      action: "user.created",
      targetType: "user",
      targetLabel: user.username,
      detail: `Created ${user.role === "ADMIN" ? "administrator" : "member"} account ${user.username}. A one-time password was issued.`,
    });
    return { user, temporaryPassword };
  } catch (error) {
    if (isUniqueConflict(error)) throw new HttpError(409, "An account with that username already exists");
    throw error;
  }
}

export async function updateAccount(
  actor: Actor,
  id: string,
  input: { name?: string; role?: "ADMIN" | "USER"; status?: "ACTIVE" | "SUSPENDED" },
) {
  adminOnly(actor);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "Account not found");
  if (actor.id === user.id && input.status === "SUSPENDED") {
    throw new HttpError(400, "You cannot revoke your own access");
  }
  await assertAdminRemains(user, input);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      status: input.status,
    },
  });
  const access =
    input.status === "ACTIVE" ? "Granted access." : input.status === "SUSPENDED" ? "Revoked access." : "Updated the account.";
  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action: input.status === "ACTIVE" ? "user.granted" : input.status === "SUSPENDED" ? "user.revoked" : "user.updated",
    targetType: "user",
    targetLabel: updated.username,
    detail: `${access} ${updated.username} is ${updated.role === "ADMIN" ? "an administrator" : "a member"} and ${updated.status === "ACTIVE" ? "active" : "suspended"}.`,
  });
  return updated;
}

export async function rotatePassword(actor: Actor, id: string) {
  adminOnly(actor);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "Account not found");
  const temporaryPassword = generatePassword();
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      mustChangePassword: true,
    },
  });
  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action: "user.password_rotated",
    targetType: "user",
    targetLabel: user.username,
    detail: `Rotated the password for ${user.username}. The new password was shown once and must be changed at the next sign-in.`,
  });
  return { username: user.username, temporaryPassword };
}

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new HttpError(401, "Sign in required");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(400, "Current password is incorrect");
  if (currentPassword === newPassword) {
    throw new HttpError(400, "Choose a password that is different from the temporary one");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    },
  });
  await logActivity({
    actorId: user.id,
    actorName: user.name,
    action: "user.password_changed",
    targetType: "user",
    targetLabel: user.username,
    detail: `${user.username} replaced their password.`,
  });
  return updated;
}

export async function deleteAccount(actor: Actor, id: string) {
  adminOnly(actor);
  if (actor.id === id) throw new HttpError(400, "You cannot delete your own account");
  const user = await prisma.user.findUnique({ where: { id }, include: { workspaces: true } });
  if (!user) throw new HttpError(404, "Account not found");
  await assertAdminRemains(user, { status: "SUSPENDED", role: "USER" });
  if (user.workspaces.length > 0) {
    throw new HttpError(400, "Reassign or delete this account's workspaces before deleting it");
  }
  await prisma.user.delete({ where: { id } });
  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action: "user.deleted",
    targetType: "user",
    targetLabel: user.username,
    detail: `Deleted account ${user.username}.`,
  });
}

import { prisma } from "@/lib/db";

export async function logActivity(entry: {
  actorId?: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetLabel: string;
  detail: string;
}) {
  await prisma.activityLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorName: entry.actorName,
      action: entry.action,
      targetType: entry.targetType,
      targetLabel: entry.targetLabel,
      detail: entry.detail,
    },
  });
}

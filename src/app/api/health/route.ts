import { bootControlPlane } from "@/lib/boot";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  bootControlPlane();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ ok: true });
  } catch (error) {
    console.error(error);
    return fail("Database is unavailable", 503);
  }
}

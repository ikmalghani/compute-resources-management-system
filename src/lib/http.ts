import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/errors";

export { HttpError } from "@/lib/errors";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}

export function handle(error: unknown) {
  if (error instanceof HttpError) return fail(error.message, error.status);
  if (error instanceof ZodError) {
    return fail(error.issues[0]?.message || "Invalid input", 400);
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Internal error";
  return fail(message, 500);
}

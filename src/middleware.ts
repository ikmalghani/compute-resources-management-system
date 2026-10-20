import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, authSecret } from "@/lib/session";
import { jwtVerify } from "jose";

const APP_PREFIXES = ["/dashboard", "/workspaces", "/users", "/scheduler", "/activity", "/view"];
const PASSWORD_PATH = "/account/password";

function isAppPath(pathname: string) {
  return APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readToken(token) : null;
  if (token && !session) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.redirect(new URL(session.mcp ? PASSWORD_PATH : "/dashboard", request.url));
  }

  if (pathname === "/login" || pathname === "/setup") {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(new URL(session.mcp ? PASSWORD_PATH : "/dashboard", request.url));
  }

  if (pathname === PASSWORD_PATH) {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (!session.mcp) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (!isAppPath(pathname)) return NextResponse.next();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (session.mcp) return NextResponse.redirect(new URL(PASSWORD_PATH, request.url));
  return NextResponse.next();
}

async function readToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    return { mcp: payload.mcp === true };
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/setup",
    "/dashboard",
    "/dashboard/:path*",
    "/workspaces",
    "/workspaces/:path*",
    "/users",
    "/users/:path*",
    "/scheduler",
    "/scheduler/:path*",
    "/activity",
    "/activity/:path*",
    "/account/password",
    "/view/:path*",
  ],
};

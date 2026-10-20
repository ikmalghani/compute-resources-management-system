import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "crems_session";

export function authSecret() {
  const value = process.env.AUTH_SECRET || "dev-only-crems-auth-secret-change";
  return new TextEncoder().encode(value);
}

export async function signSession(user: { id: string; role: string; username: string; mustChangePassword: boolean }) {
  return new SignJWT({ role: user.role, username: user.username, mcp: user.mustChangePassword })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authSecret());
}

export async function readSession(token: string) {
  const { payload } = await jwtVerify(token, authSecret());
  return payload;
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

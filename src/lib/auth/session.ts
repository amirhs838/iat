// =============================================================================
// Admin session management — opaque tokens, DB-backed, httpOnly cookies.
//   - Token: 32 random bytes (base64url), only its SHA-256 is stored in DB.
//   - Cookie: httpOnly + sameSite=lax + secure (in production), 7-day expiry.
//   - Rate limiting for login is handled in src/lib/auth/rate-limit.ts.
// =============================================================================

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ADMIN_COOKIE_NAME = "iat_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AdminIdentity {
  id: string;
  username: string;
}

export async function createAdminSession(
  adminUserId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminUserId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the authenticated admin identity, or null. */
export async function getAdminFromCookies(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { id: session.adminUser.id, username: session.adminUser.username };
}

export async function destroyCurrentAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (token) {
    await db.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(ADMIN_COOKIE_NAME);
}

/** Prune expired sessions (call opportunistically). */
export async function pruneExpiredSessions(): Promise<void> {
  await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

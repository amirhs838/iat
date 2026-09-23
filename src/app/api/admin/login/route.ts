// =============================================================================
// POST /api/admin/login — rate-limited admin authentication.
// =============================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError, clientIp, sameOrigin } from "@/lib/api-utils";
import { verifyPassword } from "@/lib/auth/password";
import { createAdminSession } from "@/lib/auth/session";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError("cross-origin request rejected", 403);

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) return jsonError("validation failed", 422);

  const ip = clientIp(req);
  const key = `login:${ip}:${parsed.data.username}`;
  const rl = checkRateLimit(key);
  if (!rl.allowed) {
    return jsonError("too many attempts — try again later", 429, { retryAfterSec: rl.retryAfterSec });
  }

  const admin = await db.adminUser.findUnique({ where: { username: parsed.data.username } });
  const ok = admin ? await verifyPassword(parsed.data.password, admin.passwordHash) : false;

  if (!ok || !admin) {
    recordFailedAttempt(key);
    return jsonError("invalid credentials", 401);
  }

  clearAttempts(key);
  await createAdminSession(admin.id, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
  await db.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  return json({ ok: true, username: admin.username });
}

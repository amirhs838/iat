// =============================================================================
// GET  /api/admin/settings — platform versions + config summary.
// POST /api/admin/settings — change own password (rate-limited separately).
// =============================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError, sameOrigin } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-utils";
import { getAdminFromCookies } from "@/lib/auth/session";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { IAT_TEST_DEFINITION, BLOCK_5_TRIAL_COUNT } from "@/config/iat/test-definition";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const admin = await getAdminFromCookies();
  const [testVersions, counts] = await Promise.all([
    db.testVersion.findMany({ orderBy: { createdAt: "desc" } }),
    db.session.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return json({
    admin: admin?.username ?? null,
    currentTestVersion: {
      code: IAT_TEST_DEFINITION.code,
      name: IAT_TEST_DEFINITION.name,
      version: IAT_TEST_DEFINITION.version,
      scoringVersion: IAT_TEST_DEFINITION.scoringVersion,
      blockStructure: IAT_TEST_DEFINITION.blocks.map((b) => b.trialCount).join("/"),
      block5TrialCount: BLOCK_5_TRIAL_COUNT,
      scoring: IAT_TEST_DEFINITION.scoring,
      exemplars: {
        targets: IAT_TEST_DEFINITION.targets.map((t) => ({ key: t.key, label: t.label, n: t.exemplars.length, type: t.stimulusType })),
        attributes: IAT_TEST_DEFINITION.attributes.map((t) => ({ key: t.key, label: t.label, n: t.exemplars.length, type: t.stimulusType })),
      },
    },
    testVersions: testVersions,
    sessionCounts: counts,
  });
}

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError("cross-origin request rejected", 403);
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = ChangePasswordSchema.safeParse(bodyRaw);
  if (!parsed.success) return jsonError("validation failed (min 10 chars)", 422);

  const adminIdentity = await getAdminFromCookies();
  if (!adminIdentity) return jsonError("unauthorized", 401);

  const admin = await db.adminUser.findUnique({ where: { id: adminIdentity.id } });
  if (!admin) return jsonError("unauthorized", 401);

  const ok = await verifyPassword(parsed.data.currentPassword, admin.passwordHash);
  if (!ok) return jsonError("current password is incorrect", 401);

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });
  return json({ ok: true });
}

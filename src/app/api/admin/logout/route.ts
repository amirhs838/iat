// =============================================================================
// POST /api/admin/logout
// =============================================================================

import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/api-utils";
import { destroyCurrentAdminSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ ok: false }, 403);
  await destroyCurrentAdminSession();
  return json({ ok: true });
}

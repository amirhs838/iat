// =============================================================================
// GET /api/admin/me — current admin identity (session check).
// =============================================================================

import { NextRequest } from "next/server";
import { json } from "@/lib/api-utils";
import { getAdminFromCookies } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const admin = await getAdminFromCookies();
  if (!admin) return json({ authenticated: false }, 401);
  return json({ authenticated: true, username: admin.username });
}

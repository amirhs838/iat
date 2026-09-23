// =============================================================================
// POST /api/session/[id]/abandon — best-effort marker sent via
// navigator.sendBeacon on page unload DURING a running test.
// Only transitions RUNNING -> ABANDONED (never touches COMPLETED sessions).
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await db.session.findUnique({ where: { id }, select: { status: true } });
  if (!session) return jsonError("session not found", 404);
  if (session.status !== "RUNNING") {
    return json({ ok: true, ignored: true, status: session.status });
  }
  await db.session.update({
    where: { id },
    data: { status: "ABANDONED", abandonedAt: new Date() },
  });
  return json({ ok: true });
}

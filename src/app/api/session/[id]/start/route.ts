// =============================================================================
// POST /api/session/[id]/start — mark session RUNNING when the test actually
// begins (after successful preload). No requests happen during trials.
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, jsonError } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return jsonError("session not found", 404);
  if (session.status === "COMPLETED") return jsonError("session already completed", 409);
  if (session.status === "RUNNING") return json({ ok: true, alreadyRunning: true });

  await db.session.update({
    where: { id },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  return json({ ok: true });
}

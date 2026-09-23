// =============================================================================
// GET /api/admin/sessions/[id] — full session detail:
// session + participant + both scores + block statistics + all trials.
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, jsonError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-utils";
import { mean, median, sd } from "@/lib/admin-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const session = await db.session.findUnique({
    where: { id },
    include: {
      participant: true,
      testVersion: { select: { id: true, code: true, version: true, name: true, scoringVersion: true, blockStructure: true } },
      scores: true,
      trials: { orderBy: { globalTrialNumber: "asc" } },
    },
  });
  if (!session) return jsonError("session not found", 404);

  const blockStats = [1, 2, 3, 4, 5, 6, 7].map((b) => {
    const ts = session.trials.filter((t) => t.blockNumber === b);
    const rts = ts.map((t) => t.rt).filter((v): v is number => v !== null);
    const correctRts = ts.filter((t) => t.correct && t.rt !== null).map((t) => t.rt as number);
    return {
      blockNumber: b,
      trials: ts.length,
      errors: ts.filter((t) => !t.correct).length,
      meanRt: mean(rts),
      medianRt: median(rts),
      sdRt: sd(rts),
      meanRtCorrect: mean(correctRts),
    };
  });

  const { blockPlanJson, ...sessionRest } = session;
  // Plan is large; expose only block-level info for the UI (full plan is stored).
  let blocksSummary: unknown = null;
  try {
    const plan = JSON.parse(blockPlanJson);
    blocksSummary = plan.blocks;
  } catch {
    blocksSummary = null;
  }

  return json({
    session: sessionRest,
    blocksSummary,
    scores: session.scores,
    blockStats,
    trials: session.trials,
  });
}

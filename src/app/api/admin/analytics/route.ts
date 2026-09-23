// =============================================================================
// GET /api/admin/analytics — deeper research view:
//   D by condition, block-wise RTs, exclusion reasons, sessions over time.
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-utils";
import { parseFilters, completedWhere, sweepStaleSessions, mean, sd, median } from "@/lib/admin-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  await sweepStaleSessions();
  const filters = parseFilters(req.nextUrl.searchParams);
  const where = completedWhere(filters);

  const scores = await db.score.findMany({
    where: { scoringAlgorithm: "improved-d-2003", session: where },
    select: {
      sessionId: true,
      normalizedD: true,
      valid: true,
      exclusionReason: true,
      errorRate: true,
      fastResponseRate: true,
      session: { select: { conditionOrder: true, completedAt: true } },
    },
  });

  // D by condition
  const dByCondition = (["A", "B"] as const).map((cond) => {
    const vals = scores
      .filter((s) => s.valid && s.session.conditionOrder === cond && s.normalizedD !== null)
      .map((s) => s.normalizedD as number);
    return {
      condition: cond,
      n: vals.length,
      meanD: mean(vals),
      sdD: sd(vals),
      medianD: median(vals),
    };
  });

  // Exclusion reasons
  const reasonCounts = new Map<string, number>();
  for (const s of scores.filter((x) => !x.valid)) {
    const key = s.exclusionReason ?? "unknown";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const exclusionReasons = [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count }));

  // Sessions over time (last 30 days)
  const since = new Date(Date.now() - 30 * 86400000);
  const completedList = await db.session.findMany({
    where: { ...where, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const dayMap = new Map<string, number>();
  for (const s of completedList) {
    const day = s.createdAt.toISOString().slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const sessionsOverTime: { date: string; count: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    sessionsOverTime.push({ date: d, count: dayMap.get(d) ?? 0 });
  }

  // Block-wise RT (valid sessions only, correct trials)
  const validSessionIds = scores.filter((s) => s.valid).map((s) => s.sessionId);
  const trials = await db.trial.findMany({
    where: { sessionId: { in: validSessionIds }, blockNumber: { in: [3, 4, 6, 7] }, rt: { not: null } },
    select: { blockNumber: true, rt: true, correct: true },
  });
  const blockRt = [3, 4, 6, 7].map((b) => {
    const all = trials.filter((t) => t.blockNumber === b).map((t) => t.rt as number);
    const correct = trials.filter((t) => t.blockNumber === b && t.correct).map((t) => t.rt as number);
    return {
      block: `B${b}`,
      meanRt: mean(all),
      medianRt: median(all),
      meanRtCorrect: mean(correct),
      n: all.length,
    };
  });

  return json({
    dByCondition,
    exclusionReasons,
    sessionsOverTime,
    blockRt,
    quality: {
      meanErrorRate: mean(scores.filter((s) => s.valid).map((s) => s.errorRate ?? 0)),
      meanFastResponseRate: mean(scores.filter((s) => s.valid).map((s) => s.fastResponseRate ?? 0)),
    },
  });
}

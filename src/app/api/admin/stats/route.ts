// =============================================================================
// GET /api/admin/stats — dashboard metric cards + distributions.
// Query: from, to, testVersionId, conditionOrder, validity=all|valid|invalid
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/api-utils";
import { requireAdmin, intParam } from "@/lib/api-utils";
import { parseFilters, completedWhere, sweepStaleSessions, median } from "@/lib/admin-queries";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  await sweepStaleSessions();
  const sp = req.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const where = completedWhere(filters);

  const [totalParticipants, completedSessions] = await Promise.all([
    db.participant.count(),
    db.session.count({ where }),
  ]);

  // Completion-rate denominator: same date/condition/version filters as the
  // numerator, but WITHOUT the validity filter and across both terminal
  // statuses (COMPLETED + ABANDONED) — "of the sessions that ran to an end,
  // how many completed".
  const denominatorWhere: Prisma.SessionWhereInput = { ...completedWhere(filters) };
  delete denominatorWhere.scores;
  denominatorWhere.status = { in: ["COMPLETED", "ABANDONED"] };
  const allNonCreated = await db.session.count({ where: denominatorWhere });

  // Scores (improved algorithm) joined to matching sessions
  const scores = await db.score.findMany({
    where: { scoringAlgorithm: "improved-d-2003", session: where },
    select: { normalizedD: true, valid: true, errorRate: true, sessionId: true },
  });

  const validityFiltered = scores.filter((s) =>
    filters.validity === "all" ? true : filters.validity === "valid" ? s.valid : !s.valid,
  );

  const validScores = validityFiltered.filter((s) => s.valid);
  const invalidCount = validityFiltered.filter((s) => !s.valid).length;

  const dValues = validScores.map((s) => s.normalizedD).filter((v): v is number => v !== null);
  const meanD = dValues.length ? dValues.reduce((s, v) => s + v, 0) / dValues.length : null;

  // Median RT over correct trials of valid sessions
  const validSessionIds = new Set(validScores.map((s) => s.sessionId));
  const rts = await db.trial.findMany({
    where: { sessionId: { in: [...validSessionIds] }, correct: true, rt: { not: null } },
    select: { rt: true },
  });
  const rtValues = rts.map((t) => t.rt as number);
  const medianRt = median(rtValues);

  const completedCount = validityFiltered.length;
  const validSessions = validScores.length;
  const invalidSessions = invalidCount;
  const completionRate = allNonCreated > 0 ? completedSessions / allNonCreated : null;

  // ---- Histograms ---------------------------------------------------------
  const binCount = intParam(sp.get("bins"), 20, 5, 60);

  const histogram = (values: number[], min: number, max: number) => {
    const width = (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      start: +(min + i * width).toFixed(3),
      end: +(min + (i + 1) * width).toFixed(3),
      count: 0,
    }));
    for (const v of values) {
      if (v < min || v > max) continue;
      const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
      bins[idx].count += 1;
    }
    return bins;
  };

  const dHistogram = histogram(dValues, -1.5, 1.5);
  const rtHistogram = histogram(
    rtValues.filter((v) => v >= 200 && v <= 2000),
    200,
    2000,
  );
  const errorRates = validScores.map((s) => s.errorRate ?? 0);
  const errorRateHistogram = histogram(errorRates, 0, 0.5);

  return json({
    cards: {
      totalParticipants,
      completedSessions,
      validSessions,
      invalidSessions,
      meanD,
      medianRt,
      completionRate,
    },
    charts: {
      dHistogram,
      rtHistogram,
      errorRateHistogram,
    },
  });
}

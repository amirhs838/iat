// =============================================================================
// GET /api/admin/sessions — paginated session list with filters.
// Query: page, pageSize, from, to, testVersionId, conditionOrder, validity,
//        status (all|COMPLETED|ABANDONED|RUNNING|INVALID|CREATED|PENDING_SYNC), q
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/api-utils";
import { requireAdmin, intParam } from "@/lib/api-utils";
import { parseFilters, sweepStaleSessions, type AdminFilters } from "@/lib/admin-queries";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  await sweepStaleSessions();
  const sp = req.nextUrl.searchParams;
  const page = intParam(sp.get("page"), 1, 1, 100000);
  const pageSize = intParam(sp.get("pageSize"), 25, 5, 200);
  const filters: AdminFilters = parseFilters(sp);
  const status = sp.get("status") ?? "all";
  const q = sp.get("q")?.trim() ?? "";

  // Build the WHERE clause so that ALL selected filters combine (AND):
  //   status + conditionOrder + date range + testVersion + validity + search.
  // Validity is score-derived, so it implies a COMPLETED session unless an
  // explicit status was chosen (then the score filter simply won't match
  // sessions without scores — e.g. ABANDONED + valid → empty by definition).
  const where: Prisma.SessionWhereInput = {};
  if (status !== "all") {
    where.status = status;
  } else if (filters.validity !== "all") {
    where.status = "COMPLETED";
  }
  if (filters.conditionOrder) where.conditionOrder = filters.conditionOrder;
  if (filters.testVersionId) where.testVersionId = filters.testVersionId;
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = filters.from;
  if (filters.to) createdAt.lte = filters.to;
  if (filters.from || filters.to) where.createdAt = createdAt;
  if (filters.validity !== "all") {
    where.scores = {
      some: { scoringAlgorithm: "improved-d-2003", valid: filters.validity === "valid" },
    };
  }

  if (q) {
    where.OR = [
      { participant: { anonymousId: { contains: q } } },
      { id: q },
    ];
  }

  const [total, sessions] = await Promise.all([
    db.session.count({ where }),
    db.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        conditionOrder: true,
        blockOrder: true,
        randomSeed: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        browser: true,
        operatingSystem: true,
        deviceType: true,
        screenWidth: true,
        screenHeight: true,
        fullscreenExitCount: true,
        visibilityChangeCount: true,
        exclusionReason: true,
        testVersion: { select: { id: true, code: true, version: true } },
        participant: { select: { id: true, anonymousId: true, age: true, gender: true } },
        scores: {
          where: { scoringAlgorithm: "improved-d-2003" },
          select: { normalizedD: true, dScore: true, valid: true, errorRate: true, fastResponseRate: true },
        },
        _count: { select: { trials: true } },
      },
    }),
  ]);

  return json({
    items: sessions.map((s) => ({
      ...s,
      score: s.scores[0] ?? null,
      scores: undefined,
    })),
    total,
    page,
    pageSize,
  });
}

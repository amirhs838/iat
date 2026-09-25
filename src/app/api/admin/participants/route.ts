// =============================================================================
// GET /api/admin/participants — paginated participant list with session stats.
// =============================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json } from "@/lib/api-utils";
import { requireAdmin, intParam } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const page = intParam(sp.get("page"), 1, 1, 100000);
  const pageSize = intParam(sp.get("pageSize"), 25, 5, 200);
  const q = sp.get("q")?.trim() ?? "";

  const where = q ? { anonymousId: { contains: q } } : {};

  const [total, participants] = await Promise.all([
    db.participant.count({ where }),
    db.participant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        anonymousId: true,
        age: true,
        gender: true,
        education: true,
        income: true,
        religiosity: true,
        occupation: true,
        consent: true,
        consentAt: true,
        createdAt: true,
        sessions: {
          select: {
            id: true,
            status: true,
            scores: {
              where: { scoringAlgorithm: "improved-d-2003" },
              select: { normalizedD: true, valid: true },
            },
          },
        },
      },
    }),
  ]);

  return json({
    items: participants.map((p) => ({
      ...p,
      sessionCount: p.sessions.length,
      completedCount: p.sessions.filter((s) => s.status === "COMPLETED").length,
      sessions: undefined,
    })),
    total,
    page,
    pageSize,
  });
}

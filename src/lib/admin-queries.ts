// =============================================================================
// Shared admin query helpers: filter parsing, stale-session sweep.
// =============================================================================

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface AdminFilters {
  from: Date | null;
  to: Date | null;
  testVersionId: string | null;
  conditionOrder: "A" | "B" | null;
  validity: "all" | "valid" | "invalid";
}

export function parseFilters(searchParams: URLSearchParams): AdminFilters {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const condition = searchParams.get("conditionOrder");
  const validity = searchParams.get("validity");

  return {
    from: fromStr ? new Date(fromStr) : null,
    to: toStr ? new Date(toStr) : null,
    testVersionId: searchParams.get("testVersionId") || null,
    conditionOrder: condition === "A" || condition === "B" ? condition : null,
    validity: validity === "valid" || validity === "invalid" ? validity : "all",
  };
}

/** Sessions stuck in RUNNING for > 6h are marked ABANDONED (lazy sweep). */
export async function sweepStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await db.session.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: cutoff } },
    data: { status: "ABANDONED", abandonedAt: new Date() },
  });
}

/** WHERE clause for completed sessions matching the filters. */
export function completedWhere(
  f: AdminFilters,
  extra: Prisma.SessionWhereInput = {},
): Prisma.SessionWhereInput {
  const where: Prisma.SessionWhereInput = {
    status: "COMPLETED",
    ...extra,
  };
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from) createdAt.gte = f.from;
  if (f.to) createdAt.lte = f.to;
  if (f.from || f.to) where.createdAt = createdAt;
  if (f.testVersionId) where.testVersionId = f.testVersionId;
  if (f.conditionOrder) where.conditionOrder = f.conditionOrder;
  // Validity is defined by the improved-D score row; enforce it here so every
  // consumer (stats, analytics, sessions, exports) filters identically.
  if (f.validity !== "all") {
    where.scores = {
      some: { scoringAlgorithm: "improved-d-2003", valid: f.validity === "valid" },
    };
  }
  return where;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function sd(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

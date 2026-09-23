// =============================================================================
// POST /api/session/[id]/complete — receive all trials + quality metadata,
// validate against the immutable session plan, compute scores SERVER-SIDE
// (single source of truth), persist raw trials (never transformed) and Score
// rows (improved + conventional), and return the participant-facing result.
//
// Idempotency: if the session is already COMPLETED -> 409 with the existing
// result. Retry after upload failure (PENDING_SYNC / CREATED / RUNNING) is
// allowed and atomically replaces trials+scores in a transaction.
// =============================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError } from "@/lib/api-utils";
import { validateSubmittedTrials, computeSessionScores } from "@/lib/iat/scoring/index";
import {
  IMPROVED_D_SCORING_ALGORITHM,
  IMPROVED_D_SCORING_VERSION,
} from "@/lib/iat/scoring/improved-d-score";
import {
  CONVENTIONAL_SCORING_ALGORITHM,
  CONVENTIONAL_SCORING_VERSION,
} from "@/lib/iat/scoring/conventional-score";
import {
  interpretNormalizedD,
  RESULT_CAVEAT_FA,
  INVALID_RESULT_FA,
  exclusionReasonFa,
  magnitudeLevel,
} from "@/lib/iat/interpretation";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import type { SessionPlan } from "@/lib/iat/types";

export const runtime = "nodejs";

const TrialSchema = z.object({
  blockNumber: z.number().int().min(1).max(7),
  trialNumberInBlock: z.number().int().min(1).max(100),
  globalTrialNumber: z.number().int().min(1).max(1000),
  stimulusId: z.string().min(1).max(100),
  responseKey: z.enum(["E", "I"]).nullable(),
  rt: z.number().int().min(0).max(120000).nullable(),
  correctionRt: z.number().int().min(0).max(120000).nullable(),
  errorCount: z.number().int().min(0).max(100),
  timestamp: z.number().int().min(0),
});

const BodySchema = z.object({
  trials: z.array(TrialSchema).min(1).max(400),
  quality: z.object({
    fullscreenExitCount: z.number().int().min(0).max(1000).default(0),
    fullscreenDenied: z.boolean().default(false),
    visibilityChangeCount: z.number().int().min(0).max(10000).default(0),
    awayDurationMs: z.number().int().min(0).max(86_400_000).default(0),
  }),
});

function buildResultPayload(session: { conditionOrder: string }, improved: ReturnType<typeof computeSessionScores>["improved"], normalizedD: number | null, sessionValid: boolean, exclusionReason: string | null, errorRate: number | null, fastResponseRate: number | null) {
  const labels = {
    iranian: IAT_TEST_DEFINITION.targets[0].label,
    afghan: IAT_TEST_DEFINITION.targets[1].label,
    positive: IAT_TEST_DEFINITION.attributes[0].label,
    negative: IAT_TEST_DEFINITION.attributes[1].label,
  };
  if (!sessionValid || normalizedD === null) {
    return {
      valid: false,
      dScore: null,
      rawD: improved.dScore,
      level: null,
      interpretation: INVALID_RESULT_FA,
      reasonFa: exclusionReasonFa(exclusionReason),
      caveat: RESULT_CAVEAT_FA,
      conditionOrder: session.conditionOrder,
      errorRate,
      fastResponseRate,
    };
  }
  const interp = interpretNormalizedD(normalizedD, labels);
  return {
    valid: true,
    dScore: normalizedD,
    rawD: improved.dScore,
    level: magnitudeLevel(Math.abs(normalizedD)),
    interpretation: interp.text,
    reasonFa: null,
    caveat: RESULT_CAVEAT_FA,
    conditionOrder: session.conditionOrder,
    errorRate,
    fastResponseRate,
  };
}

/**
 * Rebuild the participant-facing result from the PERSISTED score rows.
 * Used for idempotent 409 replies when the session is already COMPLETED
 * (e.g. the client retried after a lost response) so the participant still
 * sees their result instead of getting stuck in a retry loop.
 */
function buildResultFromStoredScore(
  session: { conditionOrder: string },
  improvedScore: {
    dScore: number | null;
    normalizedD: number | null;
    valid: boolean;
    exclusionReason: string | null;
    errorRate: number | null;
    fastResponseRate: number | null;
  } | null,
) {
  const empty: NonNullable<Parameters<typeof buildResultFromStoredScore>[1]> = {
    dScore: null,
    normalizedD: null,
    valid: false,
    exclusionReason: null,
    errorRate: null,
    fastResponseRate: null,
  };
  const s = improvedScore ?? empty;
  return buildResultPayload(
    session,
    { dScore: s.dScore } as ReturnType<typeof computeSessionScores>["improved"],
    s.normalizedD,
    s.valid,
    s.exclusionReason,
    s.errorRate,
    s.fastResponseRate,
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return jsonError("validation failed", 422, { issues: parsed.error.issues?.slice(0, 5) });
  }
  const { trials, quality } = parsed.data;

  const session = await db.session.findUnique({ where: { id } });
  if (!session) return jsonError("session not found", 404);

  if (session.status === "COMPLETED") {
    // Idempotent reply WITH the stored result: a client retrying after a
    // lost response recovers its result instead of being stuck retrying.
    const storedScores = await db.score.findMany({ where: { sessionId: id } });
    const improvedStored =
      storedScores.find((s) => s.scoringAlgorithm === IMPROVED_D_SCORING_ALGORITHM) ?? null;
    return json({
      ok: true,
      sessionStatus: "COMPLETED",
      alreadyCompleted: true,
      result: buildResultFromStoredScore(session, improvedStored),
    }, 409);
  }

  let plan: SessionPlan;
  try {
    plan = JSON.parse(session.blockPlanJson) as SessionPlan;
  } catch {
    return jsonError("corrupt session plan", 500);
  }

  // ---- Validate submission against the immutable plan --------------------
  const validation = validateSubmittedTrials(plan, trials);
  if (!validation.ok) {
    await db.session.update({
      where: { id },
      data: {
        status: "INVALID",
        exclusionReason: validation.reason?.slice(0, 200),
        qualityFlags: JSON.stringify(validation.flags),
        fullscreenExitCount: quality.fullscreenExitCount,
        fullscreenDenied: quality.fullscreenDenied,
        visibilityChangeCount: quality.visibilityChangeCount,
        awayDurationMs: quality.awayDurationMs,
      },
    });
    return jsonError("submitted data failed validation", 422, {
      reason: validation.reason,
      sessionStatus: "INVALID",
    });
  }

  // ---- Score (server-side, deterministic) --------------------------------
  const scores = computeSessionScores(validation.scoringTrials, session.conditionOrder as "A" | "B", {
    fullscreenExitCount: quality.fullscreenExitCount,
    fullscreenDenied: quality.fullscreenDenied,
    visibilityChangeCount: quality.visibilityChangeCount,
    awayDurationMs: quality.awayDurationMs,
    screenWidth: session.screenWidth ?? 0,
    screenHeight: session.screenHeight ?? 0,
    deviceType: session.deviceType ?? "desktop",
    language: session.language ?? "fa",
  });
  const imp = scores.improved;

  // ---- Persist everything atomically -------------------------------------
  const trialRows = trials.map((s, idx) => {
    const spec = plan.trials[idx];
    const vFlags = validation.trials[idx]?.flags ?? [];
    return {
      sessionId: session.id,
      blockNumber: s.blockNumber,
      trialNumberInBlock: s.trialNumberInBlock,
      globalTrialNumber: s.globalTrialNumber,
      stimulusId: s.stimulusId,
      stimulusPath: spec.stimulusPath,
      stimulusType: spec.stimulusType,
      stimulusCategory: spec.stimulusCategory,
      targetCategory: spec.targetCategory,
      attributeCategory: spec.attributeCategory,
      correctKey: spec.correctKey,
      responseKey: s.responseKey,
      correct: s.responseKey === spec.correctKey,
      rt: s.rt,
      correctionRt: s.correctionRt,
      errorCount: s.errorCount,
      timestamp: new Date(s.timestamp),
      flags: vFlags.length ? JSON.stringify(vFlags) : null,
    };
  });

  const scoreRows = [
    {
      sessionId: session.id,
      scoringAlgorithm: IMPROVED_D_SCORING_ALGORITHM,
      scoringVersion: IMPROVED_D_SCORING_VERSION,
      dScore: imp.dScore,
      normalizedD: scores.normalizedD,
      d1: imp.d1,
      d2: imp.d2,
      b3Mean: imp.b3Mean,
      b4Mean: imp.b4Mean,
      b6Mean: imp.b6Mean,
      b7Mean: imp.b7Mean,
      pooledSdPractice: imp.pooledSdPractice,
      pooledSdTest: imp.pooledSdTest,
      errorRate: imp.errorRate,
      fastResponseRate: imp.fastResponseRate,
      valid: scores.sessionValid,
      exclusionReason: scores.exclusionReason,
      qualityFlags: JSON.stringify(scores.qualityFlags),
      statsJson: JSON.stringify(imp.stats),
    },
  ];
  if (scores.conventional) {
    const conv = scores.conventional;
    const dirFactor = session.conditionOrder === "A" ? 1 : -1;
    scoreRows.push({
      sessionId: session.id,
      scoringAlgorithm: CONVENTIONAL_SCORING_ALGORITHM,
      scoringVersion: CONVENTIONAL_SCORING_VERSION,
      dScore: conv.dScore,
      normalizedD: conv.dScore === null ? null : conv.dScore * dirFactor,
      d1: conv.d1,
      d2: conv.d2,
      b3Mean: conv.b3Mean,
      b4Mean: conv.b4Mean,
      b6Mean: conv.b6Mean,
      b7Mean: conv.b7Mean,
      pooledSdPractice: conv.pooledSdPractice,
      pooledSdTest: conv.pooledSdTest,
      errorRate: conv.errorRate,
      fastResponseRate: null,
      valid: conv.ok,
      exclusionReason: conv.exclusionReason,
      qualityFlags: JSON.stringify(conv.flags),
      statsJson: JSON.stringify(conv.stats),
    });
  }

  await db.$transaction(async (tx) => {
    // Replace-on-retry semantics (session was not COMPLETED)
    await tx.trial.deleteMany({ where: { sessionId: session.id } });
    await tx.score.deleteMany({ where: { sessionId: session.id } });
    await tx.trial.createMany({ data: trialRows });
    await tx.score.createMany({ data: scoreRows });
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        fullscreenExitCount: quality.fullscreenExitCount,
        fullscreenDenied: quality.fullscreenDenied,
        visibilityChangeCount: quality.visibilityChangeCount,
        awayDurationMs: quality.awayDurationMs,
      },
    });
  });

  const result = buildResultPayload(
    session,
    imp,
    scores.normalizedD,
    scores.sessionValid,
    scores.exclusionReason,
    imp.errorRate,
    imp.fastResponseRate,
  );

  return json({
    ok: true,
    sessionStatus: "COMPLETED",
    result,
  });
}

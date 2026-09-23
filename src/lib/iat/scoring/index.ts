// =============================================================================
// Scoring registry + session-level validation.
// The server is the single source of truth for scoring; the client never
// computes D-scores.
// =============================================================================

import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import type { ClientTrialResult, ClientQualityMetadata, ScoringTrial } from "@/lib/iat/types";
import {
  computeImprovedD,
  IMPROVED_D_SCORING_ALGORITHM,
  IMPROVED_D_SCORING_VERSION,
  type ImprovedDResult,
} from "@/lib/iat/scoring/improved-d-score";
import {
  computeConventionalD,
  CONVENTIONAL_SCORING_ALGORITHM,
  CONVENTIONAL_SCORING_VERSION,
} from "@/lib/iat/scoring/conventional-score";

export type ConditionOrder = "A" | "B";

export interface ValidatedTrial {
  spec: ClientTrialResult;
  flags: string[];
}

export interface SessionValidation {
  ok: boolean;
  reason: string | null;
  flags: string[];
  /** Trials with ingest-time flags attached (raw values never modified) */
  trials: ValidatedTrial[];
  scoringTrials: ScoringTrial[];
}

export interface SessionScoreResult {
  improved: ImprovedDResult;
  conventional: ReturnType<typeof computeConventionalD> | null;
  /** Sign-normalized D: positive = stronger Iranian+Positive/Afghan+Negative association */
  normalizedD: number | null;
  sessionValid: boolean;
  exclusionReason: string | null;
  qualityFlags: string[];
}

/**
 * Validate the submitted client data against the stored session plan.
 * Raw values are NEVER modified; problems are recorded as per-trial flags.
 */
export function validateSubmittedTrials(
  plan: {
    blocks: { number: number; trialCount: number }[];
    trials: { globalTrialNumber: number; stimulusId: string; blockNumber: number; correctKey: string }[];
  },
  submitted: ClientTrialResult[],
): SessionValidation {
  const flags: string[] = [];

  if (submitted.length !== plan.trials.length) {
    return {
      ok: false,
      reason: `trial_count_mismatch (expected ${plan.trials.length}, got ${submitted.length})`,
      flags: ["trial_count_mismatch"],
      trials: [],
      scoringTrials: [],
    };
  }

  const validated: ValidatedTrial[] = [];
  const scoringTrials: ScoringTrial[] = [];

  for (let i = 0; i < submitted.length; i++) {
    const s = submitted[i];
    const p = plan.trials[i];
    const tFlags: string[] = [];

    // Structural checks against the plan (order must match)
    if (s.globalTrialNumber !== p.globalTrialNumber || s.stimulusId !== p.stimulusId || s.blockNumber !== p.blockNumber) {
      return {
        ok: false,
        reason: `trial_sequence_mismatch at index ${i}`,
        flags: [...flags, "trial_sequence_mismatch"],
        trials: [],
        scoringTrials: [],
      };
    }
    if (s.responseKey !== null && s.responseKey !== "E" && s.responseKey !== "I") {
      tFlags.push("invalid_response_key");
    }
    if (s.rt === null) tFlags.push("missing_rt");
    else if (s.rt < 0 || s.rt > 60000) tFlags.push("implausible_rt");

    validated.push({ spec: s, flags: tFlags });

    // SERVER-AUTHORITATIVE correctness: derived from the immutable plan's
    // correctKey vs the client's first response key. The client is never
    // trusted for correctness judgments.
    const correct = s.responseKey !== null && s.responseKey === p.correctKey;
    scoringTrials.push({
      blockNumber: s.blockNumber,
      rt: s.rt,
      correct,
    });
  }

  return { ok: true, reason: null, flags, trials: validated, scoringTrials };
}

/**
 * Compute the full score set for a completed session.
 * `normalizedD` direction: positive = stronger Iranian+Positive /
 * Afghan+Negative association, independent of counterbalancing condition.
 */
export function computeSessionScores(
  scoringTrials: ScoringTrial[],
  conditionOrder: ConditionOrder,
  quality: ClientQualityMetadata | null,
): SessionScoreResult {
  const def = IAT_TEST_DEFINITION;
  const improved = computeImprovedD(scoringTrials, {
    errorPenaltyMs: def.scoring.errorPenaltyMs,
    slowCutoffMs: def.scoring.slowCutoffMs,
    fastThresholdMs: def.scoring.fastThresholdMs,
    fastMaxProportion: def.scoring.fastMaxProportion,
  });

  // Conventional scorer is computed for research comparison (inactive in results)
  const conventional = computeConventionalD(scoringTrials);

  // Directionality normalization (documented):
  //   raw D > 0  => blocks 3-4 pairing was faster.
  //   Condition A: blocks 3-4 pair Iranian+Positive  => normalizedD = rawD
  //   Condition B: blocks 3-4 pair Iranian+Negative  => normalizedD = -rawD
  // After normalization: positive = stronger Iranian+Positive association.
  const directionFactor = conditionOrder === "A" ? 1 : -1;
  const normalizedD = improved.dScore === null ? null : improved.dScore * directionFactor;

  const qualityFlags: string[] = [...improved.flags];
  if (quality) {
    if (quality.fullscreenExitCount > 0) qualityFlags.push(`fullscreen_exit_x${quality.fullscreenExitCount}`);
    if (quality.fullscreenDenied) qualityFlags.push("fullscreen_denied");
    if (quality.visibilityChangeCount > 0) qualityFlags.push(`visibility_change_x${quality.visibilityChangeCount}`);
    if (quality.awayDurationMs > 0) qualityFlags.push(`away_duration_ms_${quality.awayDurationMs}`);
  }

  const sessionValid = improved.ok;

  return {
    improved,
    conventional,
    normalizedD,
    sessionValid,
    exclusionReason: improved.exclusionReason,
    qualityFlags,
  };
}

export const SCORING_REGISTRY = {
  [IMPROVED_D_SCORING_ALGORITHM]: {
    version: IMPROVED_D_SCORING_VERSION,
    compute: computeImprovedD,
  },
  [CONVENTIONAL_SCORING_ALGORITHM]: {
    version: CONVENTIONAL_SCORING_VERSION,
    compute: computeConventionalD,
  },
} as const;

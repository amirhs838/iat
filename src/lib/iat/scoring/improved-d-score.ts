// =============================================================================
// IMPROVED D-SCORE — Greenwald, Nosek & Banaji (2003)
// "Understanding and Using the Implicit Association Test: I. An Improved
//  Scoring Algorithm", Journal of Personality and Social Psychology, 85(2),
//  197-216. (Recommended scoring algorithm; implementation variant "recode600"
//  + "dscore" in the reference R package IATscores.)
//
// ALGORITHM (locked — do not modify without bumping scoringVersion):
//   1. Use trials from the four critical combined blocks (3, 4, 6, 7).
//   2. Trials with rt > 10,000 ms are DELETED.
//   3. Trials with missing/implausible (null, negative) rt are excluded and
//      counted (they cannot occur in a healthy session).
//   4. If more than 10% of the remaining trials have rt < 300 ms, the session
//      is flagged invalid ("fast_responses_gt_10pct") per the paper.
//   5. Built-in error penalty (BIEP): for each critical block, error-trial
//      latencies are replaced by (block mean of CORRECT latencies) + 600 ms.
//      A block with zero correct trials cannot be penalized -> invalid.
//   6. Block means include ALL remaining trials (correct latencies + penalized
//      error latencies).
//   7. Pooled SD for (B3,B6) and (B4,B7) = sample SD (n-1) over ALL latencies
//      of the two pooled blocks (correct + penalized error), after step 2.
//   8. D1 = (M(B6) - M(B3)) / SD_pooled(3,6)
//      D2 = (M(B7) - M(B4)) / SD_pooled(4,7)
//   9. D  = (D1 + D2) / 2
//  10. Direction: positive D = faster responses on the FIRST pairing
//      (blocks 3-4) than the reversed pairing (blocks 6-7).
//
// NO 300/3000 ms recoding is applied (the paper explicitly found the improved
// algorithm superior without it; fast trials are retained unless rule 4 fires).
//
// This module is pure, deterministic, and unit-tested against hand-computed
// fixtures and an independent reference implementation (scripts/validate-scorer.ts).
// =============================================================================

import type { ScoringTrial } from "@/lib/iat/types";

export const IMPROVED_D_SCORING_ALGORITHM = "improved-d-2003";
export const IMPROVED_D_SCORING_VERSION = "improved-d-2003/v1";

export interface ImprovedDOptions {
  criticalBlocks?: number[];
  errorPenaltyMs?: number;
  slowCutoffMs?: number;
  fastThresholdMs?: number;
  fastMaxProportion?: number;
}

export interface BlockSummary {
  blockNumber: number;
  totalTrials: number;
  excludedMissingRt: number;
  excludedSlow: number;
  nUsed: number;
  nCorrect: number;
  nError: number;
  /** Mean over used trials (correct raw + penalized error latencies) */
  mean: number | null;
  /** Mean of correct-trial latencies only (raw) */
  correctMean: number | null;
}

export interface ImprovedDResult {
  ok: boolean;
  /** Raw D in procedure-native direction (positive = blocks 3-4 pairing faster) */
  dScore: number | null;
  d1: number | null;
  d2: number | null;
  b3Mean: number | null;
  b4Mean: number | null;
  b6Mean: number | null;
  b7Mean: number | null;
  pooledSdPractice: number | null;
  pooledSdTest: number | null;
  errorRate: number | null;
  fastResponseRate: number | null;
  /** Quality/validity flags (informational + validity) */
  flags: string[];
  /** Set when ok === false */
  exclusionReason: string | null;
  stats: {
    ingested: number;
    missingRt: number;
    slowRemoved: number;
    fastTrials: number;
    penalizedErrors: number;
    blockSummaries: BlockSummary[];
  };
}

/** Sample standard deviation (ddof = 1). Returns null for n < 2. */
export function sampleSd(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const ss = values.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return Math.sqrt(ss / (n - 1));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Compute the improved D-score. Pure function; throws nothing, reports
 * problems via `ok === false` + `exclusionReason`.
 */
export function computeImprovedD(
  trials: ScoringTrial[],
  options: ImprovedDOptions = {},
): ImprovedDResult {
  const criticalBlocks = options.criticalBlocks ?? [3, 4, 6, 7];
  const errorPenaltyMs = options.errorPenaltyMs ?? 600;
  const slowCutoffMs = options.slowCutoffMs ?? 10000;
  const fastThresholdMs = options.fastThresholdMs ?? 300;
  const fastMaxProportion = options.fastMaxProportion ?? 0.1;

  const flags: string[] = [];
  const blockSummaries: BlockSummary[] = [];

  // --- Step 1: restrict to critical blocks ---------------------------------
  const ingested = trials.filter((t) => criticalBlocks.includes(t.blockNumber));

  // --- Step 2/3: remove missing/implausible and slow (> cutoff) trials -----
  const usable: { blockNumber: number; rt: number; correct: boolean }[] = [];
  let missingRt = 0;
  let slowRemoved = 0;
  for (const t of ingested) {
    if (t.rt === null || t.rt === undefined || !Number.isFinite(t.rt) || t.rt < 0) {
      missingRt += 1;
      continue;
    }
    if (t.rt > slowCutoffMs) {
      slowRemoved += 1;
      continue;
    }
    usable.push({ blockNumber: t.blockNumber, rt: t.rt, correct: t.correct });
  }
  if (missingRt > 0) flags.push("trials_with_missing_rt_excluded");
  if (slowRemoved > 0) flags.push("slow_trials_over_10000ms_removed");

  // Per-block bookkeeping
  const byBlock = new Map<number, { rt: number; correct: boolean }[]>();
  for (const b of criticalBlocks) byBlock.set(b, []);
  for (const t of usable) byBlock.get(t.blockNumber)!.push(t);

  // --- Step 4: fast-response (>10% under 300ms) participant exclusion ------
  const fastTrials = usable.filter((t) => t.rt < fastThresholdMs).length;
  const fastResponseRate = usable.length > 0 ? fastTrials / usable.length : null;
  if (fastResponseRate !== null && fastResponseRate > fastMaxProportion) {
    flags.push("fast_responses_gt_10pct");
  }

  // --- Empty critical blocks ----------------------------------------------
  for (const b of criticalBlocks) {
    if (byBlock.get(b)!.length === 0) {
      return invalidResult(`empty_critical_block_${b}`, flags, {
        ingested: ingested.length,
        missingRt,
        slowRemoved,
        fastTrials,
        penalizedErrors: 0,
        blockSummaries,
      });
    }
  }

  // --- Step 5: built-in error penalty (BIEP) -------------------------------
  // errorLatency -> correctMean(block) + 600
  const correctMeans = new Map<number, number | null>();
  const penalizedErrorsCount = { value: 0 };
  const adjustedByBlock = new Map<number, number[]>();

  for (const b of criticalBlocks) {
    const trialsB = byBlock.get(b)!;
    const correctRts = trialsB.filter((t) => t.correct).map((t) => t.rt);
    const correctMean = mean(correctRts);
    correctMeans.set(b, correctMean);
    if (correctMean === null) {
      return invalidResult(`no_correct_trials_in_block_${b}`, flags, {
        ingested: ingested.length,
        missingRt,
        slowRemoved,
        fastTrials,
        penalizedErrors: 0,
        blockSummaries,
      });
    }
    const adjusted = trialsB.map((t) => (t.correct ? t.rt : correctMean + errorPenaltyMs));
    adjustedByBlock.set(b, adjusted);
    penalizedErrorsCount.value += trialsB.length - correctRts.length;
  }
  if (penalizedErrorsCount.value > 0) flags.push("errors_penalized_biep_600ms");

  // --- Step 6: block means (include penalized error latencies) -------------
  const blockMeans = new Map<number, number | null>();
  for (const b of criticalBlocks) {
    const m = mean(adjustedByBlock.get(b)!);
    blockMeans.set(b, m);
  }

  // Build block summaries
  for (const b of criticalBlocks) {
    const trialsB = byBlock.get(b)!;
    blockSummaries.push({
      blockNumber: b,
      totalTrials: ingested.filter((t) => t.blockNumber === b).length,
      excludedMissingRt: ingested.filter(
        (t) => t.blockNumber === b && (t.rt === null || t.rt === undefined || !Number.isFinite(t.rt) || t.rt < 0),
      ).length,
      excludedSlow: ingested.filter((t) => t.blockNumber === b && t.rt !== null && t.rt > slowCutoffMs).length,
      nUsed: trialsB.length,
      nCorrect: trialsB.filter((t) => t.correct).length,
      nError: trialsB.filter((t) => !t.correct).length,
      mean: blockMeans.get(b) ?? null,
      correctMean: correctMeans.get(b) ?? null,
    });
  }

  // --- Step 7: pooled SDs over paired blocks -------------------------------
  const pooledPractice = [
    ...adjustedByBlock.get(criticalBlocks[0])!,
    ...adjustedByBlock.get(criticalBlocks[2])!,
  ];
  const pooledTest = [
    ...adjustedByBlock.get(criticalBlocks[1])!,
    ...adjustedByBlock.get(criticalBlocks[3])!,
  ];
  const sdPractice = sampleSd(pooledPractice);
  const sdTest = sampleSd(pooledTest);

  if (sdPractice === null || sdTest === null) {
    return invalidResult("insufficient_trials_for_sd", flags, {
      ingested: ingested.length,
      missingRt,
      slowRemoved,
      fastTrials,
      penalizedErrors: penalizedErrorsCount.value,
      blockSummaries,
    });
  }
  if (sdPractice === 0 || sdTest === 0) {
    return invalidResult("zero_variance", flags, {
      ingested: ingested.length,
      missingRt,
      slowRemoved,
      fastTrials,
      penalizedErrors: penalizedErrorsCount.value,
      blockSummaries,
    });
  }

  // --- Steps 8-9: standardized differences and final D ---------------------
  const [b3, b4, b6, b7] = criticalBlocks;
  const d1 = (blockMeans.get(b6)! - blockMeans.get(b3)!) / sdPractice;
  const d2 = (blockMeans.get(b7)! - blockMeans.get(b4)!) / sdTest;
  const dScore = (d1 + d2) / 2;

  const totalErrors = usable.filter((t) => !t.correct).length;
  const errorRate = usable.length > 0 ? totalErrors / usable.length : null;

  const isInvalid =
    flags.includes("fast_responses_gt_10pct") ||
    flags.includes("zero_variance") ||
    flags.includes("insufficient_trials_for_sd");

  return {
    ok: !isInvalid,
    dScore,
    d1,
    d2,
    b3Mean: blockMeans.get(b3) ?? null,
    b4Mean: blockMeans.get(b4) ?? null,
    b6Mean: blockMeans.get(b6) ?? null,
    b7Mean: blockMeans.get(b7) ?? null,
    pooledSdPractice: sdPractice,
    pooledSdTest: sdTest,
    errorRate,
    fastResponseRate,
    flags,
    exclusionReason: isInvalid
      ? flags.includes("fast_responses_gt_10pct")
        ? "fast_responses_gt_10pct"
        : flags.includes("zero_variance")
          ? "zero_variance"
          : "insufficient_trials_for_sd"
      : null,
    stats: {
      ingested: ingested.length,
      missingRt,
      slowRemoved,
      fastTrials,
      penalizedErrors: penalizedErrorsCount.value,
      blockSummaries,
    },
  };

  function invalidResult(
    reason: string,
    fl: string[],
    stats: ImprovedDResult["stats"],
  ): ImprovedDResult {
    return {
      ok: false,
      dScore: null,
      d1: null,
      d2: null,
      b3Mean: null,
      b4Mean: null,
      b6Mean: null,
      b7Mean: null,
      pooledSdPractice: null,
      pooledSdTest: null,
      errorRate: null,
      fastResponseRate: null,
      flags: [...fl, reason],
      exclusionReason: reason,
      stats,
    };
  }
}

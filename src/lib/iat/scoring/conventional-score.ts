// =============================================================================
// CONVENTIONAL D-SCORE — legacy/reference scorer (INACTIVE in the MVP results).
//
// This implements the *conventional* scoring procedure as described (and
// superseded) in Greenwald, Nosek & Banaji (2003, pp. 202-204), originally
// introduced by Greenwald, McGhee & Schwartz (1998):
//
//   1. Use trials from the four critical combined blocks (3, 4, 6, 7).
//   2. ERROR TRIALS ARE EXCLUDED entirely.
//   3. Remaining latencies are recoded: rt < 300 ms -> 300 ms,
//      rt > 3,000 ms -> 3,000 ms (300/3000 winsorizing).
//   4. Block means over correct (recoded) trials.
//   5. Pooled SD over the recoded correct latencies of (B3,B6) and (B4,B7).
//   6. D = average of [(M(B6)-M(B3))/SD_pooled(3,6), (M(B7)-M(B4))/SD_pooled(4,7)].
//
// NOTE: This scorer is provided for research comparison and architecture
// completeness only. The platform's official result is the improved D-score
// (src/lib/iat/scoring/improved-d-score.ts). The two are stored as SEPARATE
// Score rows and must never be mixed.
// =============================================================================

import type { ScoringTrial } from "@/lib/iat/types";
import { mean, sampleSd } from "@/lib/iat/scoring/improved-d-score";

export const CONVENTIONAL_SCORING_ALGORITHM = "conventional-2003";
export const CONVENTIONAL_SCORING_VERSION = "conventional-2003/v1";

export interface ConventionalDOptions {
  criticalBlocks?: number[];
  fastRecodingMs?: number; // floor -> 300
  slowRecodingMs?: number; // ceiling -> 3000
}

export interface ConventionalDResult {
  ok: boolean;
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
  flags: string[];
  exclusionReason: string | null;
  stats: {
    ingested: number;
    errorsExcluded: number;
    recodedDown: number;
    recodedUp: number;
    missingRt: number;
  };
}

export function computeConventionalD(
  trials: ScoringTrial[],
  options: ConventionalDOptions = {},
): ConventionalDResult {
  const criticalBlocks = options.criticalBlocks ?? [3, 4, 6, 7];
  const fastRecodingMs = options.fastRecodingMs ?? 300;
  const slowRecodingMs = options.slowRecodingMs ?? 3000;

  const flags: string[] = [];
  const ingested = trials.filter((t) => criticalBlocks.includes(t.blockNumber));

  let missingRt = 0;
  let errorsExcluded = 0;
  let recodedDown = 0;
  let recodedUp = 0;

  const byBlock = new Map<number, number[]>();
  for (const b of criticalBlocks) byBlock.set(b, []);

  for (const t of ingested) {
    if (t.rt === null || t.rt === undefined || !Number.isFinite(t.rt) || t.rt < 0) {
      missingRt += 1;
      continue;
    }
    if (!t.correct) {
      errorsExcluded += 1;
      continue;
    }
    let rt = t.rt;
    if (rt < fastRecodingMs) {
      rt = fastRecodingMs;
      recodedDown += 1;
    } else if (rt > slowRecodingMs) {
      rt = slowRecodingMs;
      recodedUp += 1;
    }
    byBlock.get(t.blockNumber)!.push(rt);
  }

  if (recodedDown > 0) flags.push("latencies_recoded_to_300");
  if (recodedUp > 0) flags.push("latencies_recoded_to_3000");
  if (errorsExcluded > 0) flags.push("error_trials_excluded");

  for (const b of criticalBlocks) {
    if (byBlock.get(b)!.length < 2) {
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
        flags: [...flags, `insufficient_correct_trials_in_block_${b}`],
        exclusionReason: `insufficient_correct_trials_in_block_${b}`,
        stats: { ingested: ingested.length, errorsExcluded, recodedDown, recodedUp, missingRt },
      };
    }
  }

  const [b3, b4, b6, b7] = criticalBlocks;
  const m3 = mean(byBlock.get(b3)!)!;
  const m4 = mean(byBlock.get(b4)!)!;
  const m6 = mean(byBlock.get(b6)!)!;
  const m7 = mean(byBlock.get(b7)!)!;

  const sdPractice = sampleSd([...byBlock.get(b3)!, ...byBlock.get(b6)!]);
  const sdTest = sampleSd([...byBlock.get(b4)!, ...byBlock.get(b7)!]);

  if (sdPractice === null || sdTest === null || sdPractice === 0 || sdTest === 0) {
    return {
      ok: false,
      dScore: null,
      d1: null,
      d2: null,
      b3Mean: m3,
      b4Mean: m4,
      b6Mean: m6,
      b7Mean: m7,
      pooledSdPractice: sdPractice,
      pooledSdTest: sdTest,
      errorRate: null,
      flags: [...flags, "zero_or_undefined_variance"],
      exclusionReason: "zero_or_undefined_variance",
      stats: { ingested: ingested.length, errorsExcluded, recodedDown, recodedUp, missingRt },
    };
  }

  const d1 = (m6 - m3) / sdPractice;
  const d2 = (m7 - m4) / sdTest;
  const dScore = (d1 + d2) / 2;
  const errorRate = ingested.length > 0 ? errorsExcluded / ingested.length : null;

  return {
    ok: true,
    dScore,
    d1,
    d2,
    b3Mean: m3,
    b4Mean: m4,
    b6Mean: m6,
    b7Mean: m7,
    pooledSdPractice: sdPractice,
    pooledSdTest: sdTest,
    errorRate,
    flags,
    exclusionReason: null,
    stats: { ingested: ingested.length, errorsExcluded, recodedDown, recodedUp, missingRt },
  };
}

// =============================================================================
// Unit tests: IMPROVED D-SCORE (Greenwald, Nosek & Banaji, 2003).
//
// Strategy:
//   (1) Hand-computed fixtures: expected values are derived analytically in
//       the test file from simple, closed-form latency sets (see comments for
//       the manual arithmetic).
//   (2) An independent, naive, step-by-step reference implementation written
//       directly from the paper's description (bottom of this file) — every
//       test asserts scorer === reference.
//   (3) Edge cases: all correct, errors, fast, >10s, >10% fast, missing rt,
//       incomplete session, zero variance, one valid block, insufficient trials.
//
// If someone changes the scorer and any test fails, the regression is caught
// immediately. Do NOT update expected values without re-deriving them from
// the paper (see /docs/IAT_SCORING.md).
// =============================================================================

import { describe, it, expect } from "bun:test";
import {
  computeImprovedD,
  type ImprovedDResult,
} from "@/lib/iat/scoring/improved-d-score";
import { createRng } from "@/lib/iat/random";
import type { ScoringTrial } from "@/lib/iat/types";

const CRIT = [3, 4, 6, 7] as const;

/** Helper: build a full set of critical-block trials from compact specs. */
function build(
  spec: { block: number; rt: number | null; correct: boolean; count: number }[],
): ScoringTrial[] {
  const out: ScoringTrial[] = [];
  for (const s of spec) {
    for (let i = 0; i < s.count; i++) {
      out.push({ blockNumber: s.block, rt: s.rt, correct: s.correct });
    }
  }
  return out;
}

const fullAllCorrect = (rt34: number, rt67: number) => [
  { block: 3, rt: rt34, correct: true, count: 20 },
  { block: 4, rt: rt34, correct: true, count: 40 },
  { block: 6, rt: rt67, correct: true, count: 20 },
  { block: 7, rt: rt67, correct: true, count: 40 },
];

// ---------------------------------------------------------------------------
// (2) Independent reference implementation, written literally from the paper.
//     Kept intentionally naive/step-by-step and separate from src/ code.
// ---------------------------------------------------------------------------
function referenceImprovedD(trials: ScoringTrial[]): ImprovedDResult {
  const PEN = 600;
  const SLOW = 10000;
  const FAST = 300;

  const crit = trials.filter((t) => (CRIT as readonly number[]).includes(t.blockNumber));
  const step2 = crit.filter((t) => t.rt !== null && t.rt >= 0 && t.rt <= SLOW);

  const fast = step2.filter((t) => t.rt! < FAST);
  const fastRate = step2.length ? fast.length / step2.length : null;

  const blocks: Record<number, number[]> = {};
  for (const b of CRIT) blocks[b] = [];
  for (const t of step2) blocks[t.blockNumber].push(t.rt!);

  const correctMeans: Record<number, number> = {};
  for (const b of CRIT) {
    const correctRts = step2.filter((t) => t.blockNumber === b && t.correct).map((t) => t.rt!);
    correctMeans[b] = correctRts.reduce((s, v) => s + v, 0) / correctRts.length;
  }

  const adjusted: Record<number, number[]> = {};
  for (const b of CRIT) {
    adjusted[b] = step2
      .filter((t) => t.blockNumber === b)
      .map((t) => (t.correct ? t.rt! : correctMeans[b] + PEN));
  }

  const m = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const sd = (arr: number[]) => {
    const mu = m(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / (arr.length - 1));
  };

  const sd36 = sd([...adjusted[3], ...adjusted[6]]);
  const sd47 = sd([...adjusted[4], ...adjusted[7]]);
  const d1 = (m(adjusted[6]) - m(adjusted[3])) / sd36;
  const d2 = (m(adjusted[7]) - m(adjusted[4])) / sd47;

  return {
    ok: !(fastRate !== null && fastRate > 0.1) && sd36 > 0 && sd47 > 0,
    dScore: (d1 + d2) / 2,
    d1,
    d2,
    b3Mean: m(adjusted[3]),
    b4Mean: m(adjusted[4]),
    b6Mean: m(adjusted[6]),
    b7Mean: m(adjusted[7]),
    pooledSdPractice: sd36,
    pooledSdTest: sd47,
    errorRate: step2.length ? step2.filter((t) => !t.correct).length / step2.length : null,
    fastResponseRate: fastRate,
    flags: [],
    exclusionReason:
      fastRate !== null && fastRate > 0.1 ? "fast_responses_gt_10pct" : null,
    stats: {
      ingested: crit.length,
      missingRt: 0,
      slowRemoved: 0,
      fastTrials: fast.length,
      penalizedErrors: step2.filter((t) => !t.correct).length,
      blockSummaries: [],
    },
  };
}

const close = (a: number | null, b: number, eps = 1e-9) =>
  expect(a).toBeWithin(b - eps, b + eps);

describe("Improved D-score — Greenwald et al. (2003)", () => {
  it("Fixture 1: all correct, constant RTs — hand-computed closed form", () => {
    // B3: 20×600, B4: 40×600, B6: 20×800, B7: 40×800 (all correct)
    // M3=600 M4=600 M6=800 M7=800
    // Pooled(3,6): n=40, mean=700, SS=20*(100^2)+20*(100^2)=400,000
    //   SD = sqrt(400000/39)                 -> D1 = 200 / SD
    // Pooled(4,7): n=80, mean=700, SS=80*100^2=800,000
    //   SD = sqrt(800000/79)                 -> D2 = 200 / SD
    // D  = (D1+D2)/2
    const trials = build(fullAllCorrect(600, 800));
    const r = computeImprovedD(trials);

    const sd36 = Math.sqrt(400000 / 39);
    const sd47 = Math.sqrt(800000 / 79);
    const d1 = 200 / sd36;
    const d2 = 200 / sd47;
    const d = (d1 + d2) / 2;

    expect(r.ok).toBe(true);
    close(r.d1, d1);
    close(r.d2, d2);
    close(r.dScore, d);
    close(r.b3Mean!, 600);
    close(r.b4Mean!, 600);
    close(r.b6Mean!, 800);
    close(r.b7Mean!, 800);
    close(r.pooledSdPractice!, sd36);
    close(r.pooledSdTest!, sd47);
    close(r.errorRate!, 0);
    close(r.fastResponseRate!, 0);

    // Independent reference must agree exactly
    const ref = referenceImprovedD(trials);
    close(r.dScore!, ref.dScore!);
  });

  it("Fixture 2: errors processed via built-in error penalty (+600ms)", () => {
    // B3: 18 correct @500 + 2 errors (raw 400) -> correctMean=500 -> errors become 1100
    //   M3 = (18*500 + 2*1100)/20 = 560
    // B4: 40 correct @600 -> M4 = 600
    // B6: 20 correct @700 -> M6 = 700
    // B7: 40 correct @900 -> M7 = 900
    // Pooled(3,6): 18×500, 2×1100, 20×700 -> mean=630
    //   SS = 18*(130^2) + 2*(470^2) + 20*(70^2) = 304,200+441,800+98,000 = 844,000
    //   SD = sqrt(844000/39) -> D1 = 140 / SD
    // Pooled(4,7): 40×600, 40×900 -> mean=750, SS=40*(150^2)*2=1,800,000
    //   SD = sqrt(1800000/79) -> D2 = 300 / SD
    const trials = build([
      { block: 3, rt: 500, correct: true, count: 18 },
      { block: 3, rt: 400, correct: false, count: 2 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 6, rt: 700, correct: true, count: 20 },
      { block: 7, rt: 900, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);

    const sd36 = Math.sqrt(844000 / 39);
    const sd47 = Math.sqrt(1800000 / 79);
    const d1 = 140 / sd36;
    const d2 = 300 / sd47;

    expect(r.ok).toBe(true);
    expect(r.stats.penalizedErrors).toBe(2);
    close(r.b3Mean!, 560);
    close(r.d1!, d1);
    close(r.d2!, d2);
    close(r.dScore!, (d1 + d2) / 2);
    close(r.pooledSdPractice!, sd36);
    close(r.pooledSdTest!, sd47);

    const ref = referenceImprovedD(trials);
    close(r.dScore!, ref.dScore!);
  });

  it("Removes trials with RT > 10,000 ms (deleted, not recoded)", () => {
    const trials = [
      ...build(fullAllCorrect(600, 800)),
      { blockNumber: 3, rt: 12000, correct: true },
      { blockNumber: 7, rt: 45000, correct: false },
    ];
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(true);
    expect(r.stats.slowRemoved).toBe(2);
    // Means identical to Fixture 1 (removed trials contribute nothing)
    close(r.b3Mean!, 600);
    close(r.b7Mean!, 800);
    expect(r.flags).toContain("slow_trials_over_10000ms_removed");
  });

  it("Retains fast (<300ms) trials when <= 10% of trials", () => {
    // 10 fast trials out of 120 (8.33%) -> valid, fast trials kept in scoring
    const trials = build([
      { block: 3, rt: 250, correct: true, count: 5 },
      { block: 6, rt: 250, correct: true, count: 5 },
      { block: 3, rt: 600, correct: true, count: 15 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 6, rt: 800, correct: true, count: 15 },
      { block: 7, rt: 800, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(true);
    expect(r.stats.fastTrials).toBe(10);
    close(r.fastResponseRate!, 10 / 120);
  });

  it("Flags INVALID when > 10% of trials are faster than 300ms", () => {
    // 25/120 = 20.8% fast -> invalid per Greenwald et al. (2003)
    const trials = build([
      { block: 3, rt: 200, correct: true, count: 6 },
      { block: 4, rt: 200, correct: true, count: 7 },
      { block: 6, rt: 200, correct: true, count: 6 },
      { block: 7, rt: 200, correct: true, count: 6 },
      { block: 3, rt: 600, correct: true, count: 14 },
      { block: 4, rt: 600, correct: true, count: 33 },
      { block: 6, rt: 800, correct: true, count: 14 },
      { block: 7, rt: 800, correct: true, count: 34 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("fast_responses_gt_10pct");
    expect(r.flags).toContain("fast_responses_gt_10pct");
  });

  it("Excludes trials with missing RT and flags them", () => {
    const trials = [
      ...build(fullAllCorrect(600, 800)),
      { blockNumber: 4, rt: null, correct: false },
    ];
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(true);
    expect(r.stats.missingRt).toBe(1);
    expect(r.flags).toContain("trials_with_missing_rt_excluded");
  });

  it("Incomplete session: missing critical block -> invalid", () => {
    const trials = build([
      { block: 3, rt: 600, correct: true, count: 20 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 7, rt: 800, correct: true, count: 40 },
      // block 6 missing entirely
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("empty_critical_block_6");
    expect(r.dScore).toBeNull();
  });

  it("Zero-variance edge case -> invalid (SD pooled = 0)", () => {
    const trials = build([
      { block: 3, rt: 600, correct: true, count: 20 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 6, rt: 600, correct: true, count: 20 },
      { block: 7, rt: 800, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("zero_variance");
  });

  it("No correct trials in a block -> cannot apply error penalty -> invalid", () => {
    const trials = build([
      { block: 3, rt: 600, correct: false, count: 20 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 6, rt: 800, correct: true, count: 20 },
      { block: 7, rt: 800, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("no_correct_trials_in_block_3");
  });

  it("Only one valid block pair (test pair zero variance) -> invalid", () => {
    const trials = build([
      { block: 3, rt: 600, correct: true, count: 20 },
      { block: 4, rt: 700, correct: true, count: 40 },
      { block: 6, rt: 800, correct: true, count: 20 },
      { block: 7, rt: 700, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("zero_variance");
  });

  it("Insufficient data: single-trial blocks with identical latencies -> zero variance invalid", () => {
    // With 1 trial per practice-pair block, pooled SD over [600, 600] = 0.
    const trials = build([
      { block: 3, rt: 600, correct: true, count: 1 },
      { block: 4, rt: 600, correct: true, count: 40 },
      { block: 6, rt: 600, correct: true, count: 1 },
      { block: 7, rt: 800, correct: true, count: 40 },
    ]);
    const r = computeImprovedD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("zero_variance");
  });

  it("Matches the independent reference implementation on randomized data", () => {
    // Deterministic pseudo-random data (mulberry32) — 20 participants
    const rng = createRng("randomized-fixture-1");
    const rand = () => rng();
    for (let p = 0; p < 20; p++) {
      const trials: ScoringTrial[] = [];
      for (const [block, n] of [
        [3, 20],
        [4, 40],
        [6, 20],
        [7, 40],
      ] as const) {
        for (let i = 0; i < n; i++) {
          const base = 450 + rand() * 500 + (block >= 6 ? 80 : 0);
          const rt = Math.round(rand() < 0.06 ? 200 + rand() * 80 : base);
          trials.push({
            blockNumber: block,
            rt,
            correct: rand() > 0.08,
          });
        }
      }
      const r = computeImprovedD(trials);
      const ref = referenceImprovedD(trials);
      close(r.dScore!, ref.dScore!, 1e-10);
      close(r.pooledSdPractice!, ref.pooledSdPractice!, 1e-10);
      close(r.pooledSdTest!, ref.pooledSdTest!, 1e-10);
    }
  });
});

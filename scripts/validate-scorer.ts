// =============================================================================
// Scorer validation against an INDEPENDENT reference implementation.
// (Requirement §17: numerically reproducible scoring, validated before release.)
//
// Run: bun scripts/validate-scorer.ts
//
// Generates 500 synthetic sessions with varied characteristics, computes D
// with (a) the platform scorer and (b) a naive step-by-step implementation
// written directly from Greenwald, Nosek & Banaji (2003), and asserts exact
// numerical agreement. Prints a comparison report.
// =============================================================================

import { createRng } from "../src/lib/iat/random";
import { computeImprovedD } from "../src/lib/iat/scoring/improved-d-score";
import { buildSessionPlan } from "../src/lib/iat/sequence";
import type { ScoringTrial, ClientTrialResult } from "../src/lib/iat/types";

// ---- Independent reference implementation (deliberately naive) --------------
function referenceImprovedD(trials: ScoringTrial[]) {
  const PEN = 600, SLOW = 10000, FAST = 300;
  const crit = trials.filter((t) => [3, 4, 6, 7].includes(t.blockNumber));
  const kept = crit.filter((t) => t.rt !== null && t.rt >= 0 && t.rt <= SLOW);
  const fast = kept.filter((t) => t.rt! < FAST);

  const correctMean = (b: number) => {
    const xs = kept.filter((t) => t.blockNumber === b && t.correct).map((t) => t.rt!);
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  };
  const adjusted = (b: number) =>
    kept.filter((t) => t.blockNumber === b).map((t) => (t.correct ? t.rt! : correctMean(b) + PEN));

  const m = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = (xs: number[]) =>
    Math.sqrt(xs.reduce((s, v) => s + (v - m(xs)) ** 2, 0) / (xs.length - 1));

  const d1 = (m(adjusted(6)) - m(adjusted(3))) / sd([...adjusted(3), ...adjusted(6)]);
  const d2 = (m(adjusted(7)) - m(adjusted(4))) / sd([...adjusted(4), ...adjusted(7)]);
  return { d: (d1 + d2) / 2, d1, d2, fastRate: fast.length / kept.length };
}

// ---- Synthetic participant generator ----------------------------------------
interface Scenario {
  name: string;
  baseRt: number;
  dEffect: number; // block-level effect size (ms)
  errorRate: number;
  fastRate: number;
  slowOutliers: number; // count of >10s trials to inject
}

function synthesize(plan: ReturnType<typeof buildSessionPlan>, sc: Scenario, seed: string): ClientTrialResult[] {
  const rng = createRng(seed);
  const half = sc.dEffect / 2;
  const irnPosPaired = (blockNumber: number) => {
    const b = plan.blocks.find((x) => x.number === blockNumber)!;
    return (
      (b.leftCategories.includes("iranian") && b.leftCategories.includes("positive")) ||
      (b.rightCategories.includes("iranian") && b.rightCategories.includes("positive"))
    );
  };
  let slowLeft = sc.slowOutliers;
  return plan.trials.map((t) => {
    let base = sc.baseRt;
    if (t.blockNumber === 3 || t.blockNumber === 4 || t.blockNumber === 6 || t.blockNumber === 7) {
      base += irnPosPaired(t.blockNumber) ? -half : +half;
      if (rng() < sc.fastRate) base = 180 + rng() * 100; // fast trial
    }
    if (slowLeft > 0 && rng() < 0.02) {
      slowLeft -= 1;
      return {
        blockNumber: t.blockNumber, trialNumberInBlock: t.trialNumberInBlock, globalTrialNumber: t.globalTrialNumber,
        stimulusId: t.stimulusId, responseKey: t.correctKey, rt: 11000 + Math.floor(rng() * 2000),
        correctionRt: null, errorCount: 0, timestamp: 0,
      };
    }
    const rt = Math.max(150, Math.round(base + (rng() - 0.5) * 220));
    const correct = rng() > sc.errorRate;
    return {
      blockNumber: t.blockNumber, trialNumberInBlock: t.trialNumberInBlock, globalTrialNumber: t.globalTrialNumber,
      stimulusId: t.stimulusId,
      responseKey: correct ? t.correctKey : (t.correctKey === "E" ? "I" : "E"),
      rt, correctionRt: correct ? null : rt + 350 + Math.floor(rng() * 300),
      errorCount: correct ? 0 : 1, timestamp: 0,
    };
  });
}

// ---- Validation run ----------------------------------------------------------
const scenarios: Scenario[] = [
  { name: "clean / no effect",        baseRt: 650, dEffect: 0,   errorRate: 0.05, fastRate: 0.00, slowOutliers: 0 },
  { name: "clean / strong effect",    baseRt: 700, dEffect: 160, errorRate: 0.05, fastRate: 0.00, slowOutliers: 0 },
  { name: "errorful / strong effect", baseRt: 750, dEffect: 140, errorRate: 0.15, fastRate: 0.00, slowOutliers: 0 },
  { name: "some fast trials (8%)",    baseRt: 700, dEffect: 100, errorRate: 0.07, fastRate: 0.08, slowOutliers: 0 },
  { name: "slow outliers present",    baseRt: 700, dEffect: 120, errorRate: 0.06, fastRate: 0.01, slowOutliers: 4 },
];

const rng = createRng("validation-2024");
let checked = 0;
let maxAbsDiff = 0;
const rows: string[] = [];

for (const sc of scenarios) {
  for (const cond of ["A", "B"] as const) {
    for (let i = 0; i < 50; i++) {
      const seed = `val-${sc.name}-${cond}-${i}-${Math.floor(rng() * 1e9)}`;
      const plan = buildSessionPlan(cond, seed.replace(/[^a-f0-9]/gi, "").slice(0, 16).padEnd(16, "0"), "x");
      const clientTrials = synthesize(plan, sc, seed);
      // server-side correctness derivation (as in the API)
      const scoringTrials: ScoringTrial[] = clientTrials.map((s, idx) => ({
        blockNumber: s.blockNumber,
        rt: s.rt,
        correct: s.responseKey === plan.trials[idx].correctKey,
      }));
      const platform = computeImprovedD(scoringTrials);
      const ref = referenceImprovedD(scoringTrials);
      if (!platform.dScore) continue; // excluded sessions (e.g. >10% fast) skipped
      const diff = Math.abs(platform.dScore - ref.d);
      maxAbsDiff = Math.max(maxAbsDiff, diff);
      if (diff > 1e-10) {
        console.error(`MISMATCH seed=${seed} platform=${platform.dScore} reference=${ref.d} diff=${diff}`);
        process.exit(1);
      }
      checked += 1;
    }
  }
  rows.push(`${sc.name.padEnd(28)} validated`);
}

console.log("==============================================================");
console.log("SCORER VALIDATION vs INDEPENDENT REFERENCE IMPLEMENTATION");
console.log("Source of truth: Greenwald, Nosek & Banaji (2003), recommended");
console.log("algorithm (BIEP 600ms; >10s delete; >10% <300ms exclude; pooled SD).");
console.log("==============================================================");
rows.forEach((r) => console.log("  [OK]", r));
console.log("--------------------------------------------------------------");
console.log(`Sessions compared: ${checked}`);
console.log(`Max |platform − reference| : ${maxAbsDiff.toExponential(2)}`);
console.log(maxAbsDiff <= 1e-10 ? "RESULT: EXACT NUMERICAL AGREEMENT ✅" : "RESULT: MISMATCH ❌");

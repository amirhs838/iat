// =============================================================================
// Integration test: full scoring pipeline without I/O.
//   buildSessionPlan -> simulate participant responses -> validateSubmittedTrials
//   -> computeSessionScores -> directionality normalization across conditions.
// Mirrors exactly what the API does on session completion.
// =============================================================================

import { describe, it, expect } from "bun:test";
import { buildSessionPlan } from "@/lib/iat/sequence";
import { validateSubmittedTrials, computeSessionScores } from "@/lib/iat/scoring/index";
import { createRng } from "@/lib/iat/random";
import type { ClientTrialResult } from "@/lib/iat/types";

/** Simulate a participant: base shift = slower reversed-pairing responses. */
function simulateClientTrials(
  plan: ReturnType<typeof buildSessionPlan>,
  opts: { baseRt: number; compatibilityShift: number; seed: number | string },
): ClientTrialResult[] {
  const rng = createRng(`pipeline-${opts.seed}`);
  const rand = () => rng();
  return plan.trials.map((t) => {
    const block = plan.blocks.find((b) => b.number === t.blockNumber)!;
    // Behavioral model: a participant with a stronger Iranian+Positive
    // association responds faster in WHOLE blocks where the Iranian+Positive
    // pairing holds (block-level mean effect — exactly what D captures).
    let shift = 0;
    if (block.kind === "combined" || block.kind === "combined-reversed") {
      const irnPosPaired =
        (block.leftCategories.includes("iranian") && block.leftCategories.includes("positive")) ||
        (block.rightCategories.includes("iranian") && block.rightCategories.includes("positive"));
      shift = irnPosPaired ? -opts.compatibilityShift / 2 : +opts.compatibilityShift / 2;
    }
    const rt = Math.max(200, Math.round(opts.baseRt + shift + rand() * 60));
    const correct = rand() > 0.07;
    return {
      blockNumber: t.blockNumber,
      trialNumberInBlock: t.trialNumberInBlock,
      globalTrialNumber: t.globalTrialNumber,
      stimulusId: t.stimulusId,
      responseKey: correct ? t.correctKey : t.correctKey === "E" ? "I" : "E",
      rt,
      correctionRt: correct ? null : rt + 400,
      errorCount: correct ? 0 : 1,
      timestamp: 1700000000000 + t.globalTrialNumber * 3000,
    };
  });
}

describe("Full scoring pipeline", () => {
  it("Session with Iranian+Positive facilitation yields positive normalizedD in BOTH conditions", () => {
    const quality = {
      fullscreenExitCount: 0,
      fullscreenDenied: false,
      visibilityChangeCount: 0,
      awayDurationMs: 0,
      screenWidth: 1920,
      screenHeight: 1080,
      deviceType: "desktop",
      language: "fa-IR",
    };

    for (const cond of ["A", "B"] as const) {
      const plan = buildSessionPlan(cond, "integrationseed01", "x");
      const clientTrials = simulateClientTrials(plan, {
        baseRt: 700,
        compatibilityShift: 120, // iranian+positive side faster by ~120ms
        seed: 42,
      });

      const validation = validateSubmittedTrials(plan, clientTrials);
      expect(validation.ok).toBe(true);

      const scores = computeSessionScores(validation.scoringTrials, cond, quality);
      expect(scores.improved.ok).toBe(true);
      expect(scores.improved.dScore).not.toBeNull();

      // The simulated participant is faster on iranian+positive =>
      // normalized D must be POSITIVE regardless of condition order.
      expect(scores.normalizedD!).toBeGreaterThan(0.1);
    }
  });

  it("Raw D sign flips with condition order for identical behavior", () => {
    const quality = {
      fullscreenExitCount: 0,
      fullscreenDenied: false,
      visibilityChangeCount: 0,
      awayDurationMs: 0,
      screenWidth: 1920,
      screenHeight: 1080,
      deviceType: "desktop",
      language: "fa-IR",
    };
    const results: Record<string, { raw: number; norm: number }> = {};
    for (const cond of ["A", "B"] as const) {
      const plan = buildSessionPlan(cond, "integrationseed02", "x");
      const clientTrials = simulateClientTrials(plan, {
        baseRt: 700,
        compatibilityShift: 120,
        seed: 4242,
      });
      const v = validateSubmittedTrials(plan, clientTrials);
      const s = computeSessionScores(v.scoringTrials, cond, quality);
      results[cond] = { raw: s.improved.dScore!, norm: s.normalizedD! };
    }
    // raw D is procedure-native: positive = blocks3-4 pairing faster.
    // For a participant faster on iranian+positive:
    //   cond A: blocks3-4 = iranian+positive -> raw > 0
    //   cond B: blocks3-4 = afghan+positive  -> raw < 0
    expect(results.A.raw).toBeGreaterThan(0);
    expect(results.B.raw).toBeLessThan(0);
    // normalized D is behavior-native: positive for both
    expect(results.A.norm).toBeGreaterThan(0);
    expect(results.B.norm).toBeGreaterThan(0);
  });

  it("Rejects tampered submissions (wrong trial order/count)", () => {
    const plan = buildSessionPlan("A", "tamperseed000001", "x");
    const clientTrials = simulateClientTrials(plan, { baseRt: 700, compatibilityShift: 0, seed: 7 });
    const tampered = [...clientTrials];
    tampered[10] = { ...tampered[10], stimulusId: "wrong-id" };
    const v = validateSubmittedTrials(plan, tampered);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("trial_sequence_mismatch");

    const v2 = validateSubmittedTrials(plan, clientTrials.slice(0, 150));
    expect(v2.ok).toBe(false);
    expect(v2.reason).toContain("trial_count_mismatch");
  });
});

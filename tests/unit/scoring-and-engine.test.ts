// =============================================================================
// Unit tests: CONVENTIONAL D-SCORE (reference/legacy scorer) + randomization +
// counterbalancing + directionality normalization.
// =============================================================================

import { describe, it, expect } from "bun:test";
import { computeConventionalD } from "@/lib/iat/scoring/conventional-score";
import { normalizeD, magnitudeLevel, interpretNormalizedD } from "@/lib/iat/interpretation";
import { buildBlockPlan } from "@/lib/iat/blocks";
import { buildSessionPlan, generateTrialSequence } from "@/lib/iat/sequence";
import { createRng, blockSeed } from "@/lib/iat/random";
import { IAT_TEST_DEFINITION, BLOCK_5_TRIAL_COUNT } from "@/config/iat/test-definition";
import type { ScoringTrial } from "@/lib/iat/types";

// -----------------------------------------------------------------------------
// Conventional scorer
// -----------------------------------------------------------------------------
describe("Conventional D-score (legacy reference)", () => {
  it("Excludes errors and applies 300/3000 recoding", () => {
    // B3: 20 correct @500 + 5 errors -> errors excluded -> M3 = 500 (no recode)
    // B6: 20 correct @800 -> M6 = 800
    // B4: 40 correct @2500 + @3200 mix; B7: 40 correct @700
    const trials: ScoringTrial[] = [
      ...Array.from({ length: 20 }, () => ({ blockNumber: 3, rt: 500, correct: true })),
      ...Array.from({ length: 5 }, () => ({ blockNumber: 3, rt: 900, correct: false })),
      ...Array.from({ length: 40 }, (_, i) => ({
        blockNumber: 4,
        rt: i < 20 ? 2500 : 3200,
        correct: true,
      })), // 3200 -> recoded to 3000
      ...Array.from({ length: 20 }, () => ({ blockNumber: 6, rt: 800, correct: true })),
      ...Array.from({ length: 40 }, () => ({ blockNumber: 7, rt: 700, correct: true })),
    ];
    const r = computeConventionalD(trials);
    expect(r.ok).toBe(true);
    expect(r.stats.errorsExcluded).toBe(5);
    expect(r.stats.recodedUp).toBe(20);
    // M4 = (20*2500 + 20*3000)/40 = 2750
    expect(r.b4Mean).toBeCloseTo(2750, 9);
    expect(r.b3Mean).toBeCloseTo(500, 9);
    expect(r.b6Mean).toBeCloseTo(800, 9);
    expect(r.b7Mean).toBeCloseTo(700, 9);
    // D1 = (800-500)/SD(3,6 pooled)
    const sd36 = Math.sqrt(
      [
        ...Array(20).fill(500),
        ...Array(20).fill(800),
      ].reduce((s, v) => s + (v - 650) ** 2, 0) / 39,
    );
    expect(r.d1!).toBeCloseTo(300 / sd36, 9);
  });

  it("Invalid when a block lacks >= 2 correct trials", () => {
    const trials: ScoringTrial[] = [
      { blockNumber: 3, rt: 500, correct: true },
      ...Array.from({ length: 40 }, () => ({ blockNumber: 4, rt: 600, correct: true })),
      ...Array.from({ length: 20 }, () => ({ blockNumber: 6, rt: 700, correct: true })),
      ...Array.from({ length: 40 }, () => ({ blockNumber: 7, rt: 700, correct: true })),
    ];
    const r = computeConventionalD(trials);
    expect(r.ok).toBe(false);
    expect(r.exclusionReason).toBe("insufficient_correct_trials_in_block_3");
  });
});

// -----------------------------------------------------------------------------
// Directionality normalization
// -----------------------------------------------------------------------------
describe("Directionality normalization", () => {
  it("Condition A keeps sign; Condition B flips sign", () => {
    expect(normalizeD(0.4, "A")).toBeCloseTo(0.4, 12);
    expect(normalizeD(0.4, "B")).toBeCloseTo(-0.4, 12);
    expect(normalizeD(-0.25, "B")).toBeCloseTo(0.25, 12);
  });

  it("Interpretation depends on normalized value only", () => {
    const labels = { iranian: "ایرانی", afghan: "افغان", positive: "مثبت", negative: "منفی" };
    const pos = interpretNormalizedD(0.45, labels);
    expect(pos.text).toContain("ایرانی");
    expect(pos.text).toContain("مثبت");
    const neg = interpretNormalizedD(-0.45, labels);
    expect(neg.text).toContain("منفی");
    expect(magnitudeLevel(0.1)).toBe("negligible");
    expect(magnitudeLevel(0.2)).toBe("slight");
    expect(magnitudeLevel(0.5)).toBe("moderate");
    expect(magnitudeLevel(0.8)).toBe("strong");
  });
});

// -----------------------------------------------------------------------------
// Block configuration / counterbalancing
// -----------------------------------------------------------------------------
describe("7-block configuration & counterbalancing", () => {
  it("LOCKED structure: 20/20/20/40/40/20/40 with BLOCK_5_TRIAL_COUNT=40", () => {
    const counts = IAT_TEST_DEFINITION.blocks.map((b) => b.trialCount);
    expect(counts).toEqual([20, 20, 20, 40, 40, 20, 40]);
    expect(BLOCK_5_TRIAL_COUNT).toBe(40);
    const critical = IAT_TEST_DEFINITION.blocks.filter((b) => b.isCritical).map((b) => b.number);
    expect(critical).toEqual([3, 4, 6, 7]);
  });

  it("Condition A: Iranian+Positive is the FIRST pairing (blocks 3-4)", () => {
    const plan = buildBlockPlan("A");
    const b1 = plan.find((b) => b.number === 1)!;
    const b3 = plan.find((b) => b.number === 3)!;
    const b5 = plan.find((b) => b.number === 5)!;
    const b6 = plan.find((b) => b.number === 6)!;

    expect(b1.leftCategories).toEqual(["iranian"]);
    expect(b1.rightCategories).toEqual(["afghan"]);
    expect(b3.leftCategories).toEqual(["iranian", "positive"]);
    expect(b3.rightCategories).toEqual(["afghan", "negative"]);
    expect(b5.leftCategories).toEqual(["afghan"]); // targets swapped at block 5
    expect(b5.rightCategories).toEqual(["iranian"]);
    expect(b6.leftCategories).toEqual(["afghan", "positive"]); // reversed pairing
    expect(b6.rightCategories).toEqual(["iranian", "negative"]);
  });

  it("Condition B: Afghan starts left => Iranian+Negative is the FIRST pairing", () => {
    const plan = buildBlockPlan("B");
    const b1 = plan.find((b) => b.number === 1)!;
    const b3 = plan.find((b) => b.number === 3)!;
    const b5 = plan.find((b) => b.number === 5)!;
    const b6 = plan.find((b) => b.number === 6)!;

    expect(b1.leftCategories).toEqual(["afghan"]);
    expect(b3.leftCategories).toEqual(["afghan", "positive"]);
    expect(b3.rightCategories).toEqual(["iranian", "negative"]);
    expect(b5.leftCategories).toEqual(["iranian"]);
    expect(b6.leftCategories).toEqual(["iranian", "positive"]);
    expect(b6.rightCategories).toEqual(["afghan", "negative"]);
  });

  it("Attributes keep the same key across combined blocks in both conditions", () => {
    for (const cond of ["A", "B"] as const) {
      const plan = buildBlockPlan(cond);
      for (const b of plan.filter((x) => [3, 4, 6, 7].includes(x.number))) {
        expect(b.leftCategories).toContain("positive");
        expect(b.rightCategories).toContain("negative");
      }
    }
  });
});

// -----------------------------------------------------------------------------
// Randomization / sequence generation
// -----------------------------------------------------------------------------
describe("Trial sequence generator", () => {
  const seed = "abcdef0123456789";

  it("Produces exactly the planned trial counts per block", () => {
    const plan = buildSessionPlan("A", seed, "1:TD,2:AD,3:C,4:C,5:TDR,6:CR,7:CR");
    expect(plan.trials).toHaveLength(200);
    for (const b of plan.blocks) {
      const n = plan.trials.filter((t) => t.blockNumber === b.number).length;
      expect(n).toBe(b.trialCount);
    }
  });

  it("Is deterministic: same seed => identical sequence", () => {
    const a = buildSessionPlan("A", seed, "x");
    const b = buildSessionPlan("A", seed, "x");
    expect(JSON.stringify(a.trials)).toBe(JSON.stringify(b.trials));
  });

  it("Different seeds produce different orders", () => {
    const a = generateTrialSequence(buildBlockPlan("A"), "seed-one");
    const b = generateTrialSequence(buildBlockPlan("A"), "seed-two");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("Respects exact per-block category quotas (50/50 and 25/25/25/25)", () => {
    const plan = buildSessionPlan("A", seed, "x");
    for (const block of plan.blocks) {
      const trials = plan.trials.filter((t) => t.blockNumber === block.number);
      const perCategory = new Map<string, number>();
      for (const t of trials) perCategory.set(t.stimulusCategory, (perCategory.get(t.stimulusCategory) ?? 0) + 1);
      const expected = 1 / (block.leftCategories.length + block.rightCategories.length);
      for (const [cat, n] of perCategory) {
        const isLeft = block.leftCategories.includes(cat);
        const quota = isLeft ? block.trialCount * expected : block.trialCount * expected;
        expect(n).toBe(quota);
      }
      // every category of the block must appear
      for (const cat of [...block.leftCategories, ...block.rightCategories]) {
        expect(perCategory.get(cat)).toBeGreaterThan(0);
      }
    }
  });

  it("Never repeats the same exemplar on consecutive trials", () => {
    for (const cond of ["A", "B"] as const) {
      for (const s of [seed, "ffffffffffffffff", "0000000000000000"]) {
        const trials = generateTrialSequence(buildBlockPlan(cond), s);
        for (let i = 1; i < trials.length; i++) {
          if (trials[i].blockNumber === trials[i - 1].blockNumber) {
            expect(trials[i].stimulusId).not.toBe(trials[i - 1].stimulusId);
          }
        }
      }
    }
  });

  it("Caps same-category runs at 3", () => {
    for (const cond of ["A", "B"] as const) {
      const trials = generateTrialSequence(buildBlockPlan(cond), seed);
      let run = 1;
      for (let i = 1; i < trials.length; i++) {
        if (trials[i].blockNumber !== trials[i - 1].blockNumber) {
          run = 1;
          continue;
        }
        if (trials[i].stimulusCategory === trials[i - 1].stimulusCategory) {
          run += 1;
          expect(run).toBeLessThanOrEqual(3);
        } else {
          run = 1;
        }
      }
    }
  });

  it("correctKey always matches the block-side mapping", () => {
    const plan = buildSessionPlan("B", seed, "x");
    for (const t of plan.trials) {
      const block = plan.blocks.find((b) => b.number === t.blockNumber)!;
      const expectedKey = block.leftCategories.includes(t.stimulusCategory) ? "E" : "I";
      expect(t.correctKey).toBe(expectedKey);
    }
  });

  it("Randomization helper: seeded RNG is reproducible", () => {
    const a = createRng(blockSeed(seed, 3));
    const b = createRng(blockSeed(seed, 3));
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
});

// =============================================================================
// Trial sequence generator — deterministic given (seed, condition, definition).
//
// Sequence constraints (documented, reproducible):
//   (1) Exact per-block category quotas:
//         - single-discrimination blocks: 50% left category / 50% right category
//         - combined blocks: 25% per each of the four categories
//   (2) No immediate repetition of the same EXEMPLAR on consecutive trials.
//   (3) No more than MAX_SAME_CATEGORY_RUN consecutive trials of the same
//       category (prevents pathological runs; category repetition itself is
//       allowed, as in standard IAT implementations).
//
// Exemplar cycling: when a category needs more presentations than it has
// exemplars, exemplars are shuffled into cycles so every exemplar appears
// equally often before any repeats (Latin-square-like balance).
// =============================================================================

import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import type {
  BlockPlanEntry,
  CategoryDefinition,
  SessionPlan,
  TestDefinition,
  TrialSpec,
} from "@/lib/iat/types";
import { blockSeed, createRng, shuffle } from "@/lib/iat/random";
import { buildBlockPlan } from "@/lib/iat/blocks";

const MAX_SAME_CATEGORY_RUN = 3;
const MAX_SHUFFLE_ATTEMPTS = 200;

function categoryMap(def: TestDefinition): Map<string, CategoryDefinition> {
  const map = new Map<string, CategoryDefinition>();
  for (const c of [...def.targets, ...def.attributes]) map.set(c.key, c);
  return map;
}

/** Build a balanced pool of exemplar presentations for one category. */
function buildCategoryPool(
  category: CategoryDefinition,
  count: number,
  rng: ReturnType<typeof createRng>,
): { id: string; path: string; category: string }[] {
  const exemplars = category.exemplars;
  if (exemplars.length === 0) {
    throw new Error(`Category ${category.key} has no exemplars`);
  }
  const pool: { id: string; path: string; category: string }[] = [];
  const fullCycles = Math.floor(count / exemplars.length);
  const remainder = count % exemplars.length;
  // Complete cycles: shuffle each cycle so exemplars appear equally often.
  for (let c = 0; c < fullCycles; c++) {
    for (const ex of shuffle([...exemplars], rng)) {
      pool.push({ id: ex.id, path: ex.path, category: category.key });
    }
  }
  // Remainder: shuffled subset (keeps global balance within ±1).
  if (remainder > 0) {
    for (const ex of shuffle([...exemplars], rng).slice(0, remainder)) {
      pool.push({ id: ex.id, path: ex.path, category: category.key });
    }
  }
  return pool;
}

/** Check no-adjacent-exemplar-repetition and max same-category run. */
function isValidSequence(seq: { id: string; category: string }[]): boolean {
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].id === seq[i - 1].id) return false;
  }
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i].category === seq[i - 1].category ? run + 1 : 1;
    if (run > MAX_SAME_CATEGORY_RUN) return false;
  }
  return true;
}

/**
 * Interleave category pools into one randomized sequence satisfying the
 * constraints. Deterministic for a given rng state.
 */
function interleave(
  pools: { id: string; path: string; category: string }[][],
  rng: ReturnType<typeof createRng>,
): { id: string; path: string; category: string }[] {
  const flat = pools.flat();
  for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt++) {
    shuffle(flat, rng);
    // NOTE: shuffle is in-place; re-check on each attempt with fresh order.
    if (isValidSequence(flat)) return flat;
  }
  // Fallback: local repair (swap same-category-adjacent violators with the
  // nearest item that fixes the run). Guaranteed to terminate; used only if
  // 200 random shuffles did not satisfy constraints (practically never with
  // >= 4 categories, and for 2 categories run<=3 is easily satisfiable).
  return repairSequence(flat);
}

/** Deterministic local repair for constraint violations. */
function repairSequence(
  seq: { id: string; path: string; category: string }[],
): { id: string; path: string; category: string }[] {
  const out = [...seq];
  // Fix adjacent duplicate exemplars
  for (let i = 1; i < out.length; i++) {
    if (out[i].id === out[i - 1].id) {
      for (let j = i + 1; j < out.length; j++) {
        if (out[j].id !== out[i - 1].id && out[j].id !== out[j + 1]?.id) {
          const tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
          break;
        }
      }
    }
  }
  // Fix long same-category runs
  for (let i = MAX_SAME_CATEGORY_RUN; i < out.length; i++) {
    // if positions i-2..i are all same category -> swap out[i] with a later item
    if (
      out[i].category === out[i - 1].category &&
      out[i].category === out[i - 2].category
    ) {
      for (let j = i + 1; j < out.length; j++) {
        if (out[j].category !== out[i].category && out[j].category !== out[j - 1].category) {
          const tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Generate the full trial sequence for a session plan.
 * Pure function: same inputs => identical output (unit-tested).
 */
export function generateTrialSequence(
  blocks: BlockPlanEntry[],
  sessionSeed: string,
  def: TestDefinition = IAT_TEST_DEFINITION,
): TrialSpec[] {
  const catMap = categoryMap(def);
  const trials: TrialSpec[] = [];
  let globalTrialNumber = 0;

  for (const block of blocks) {
    const rng = createRng(blockSeed(sessionSeed, block.number));

    const leftCount =
      block.kind === "combined" || block.kind === "combined-reversed"
        ? block.trialCount / 4
        : block.trialCount / 2;
    const rightCount = leftCount;

    const pools = block.leftCategories
      .map((key) => buildCategoryPool(catMap.get(key)!, leftCount, rng))
      .concat(
        block.rightCategories.map((key) =>
          buildCategoryPool(catMap.get(key)!, rightCount, rng),
        ),
      );

    const sequence = interleave(pools, rng);

    sequence.forEach((item, index) => {
      globalTrialNumber += 1;
      trials.push({
        blockNumber: block.number,
        trialNumberInBlock: index + 1,
        globalTrialNumber,
        stimulusId: item.id,
        stimulusPath: item.path,
        stimulusType: catMap.get(item.category)!.stimulusType,
        stimulusCategory: item.category,
        correctKey: block.leftCategories.includes(item.category) ? "E" : "I",
        targetCategory: block.targetCategory,
        attributeCategory: block.attributeCategory,
      });
    });
  }

  return trials;
}

/** Build the complete session plan (blocks + trials). Server-side entry point. */
export function buildSessionPlan(
  conditionOrder: "A" | "B",
  sessionSeed: string,
  blockOrder: string,
  def: TestDefinition = IAT_TEST_DEFINITION,
): SessionPlan {
  const blocks = buildBlockPlan(conditionOrder, def);
  const trials = generateTrialSequence(blocks, sessionSeed, def);
  return { conditionOrder, randomSeed: sessionSeed, blockOrder, blocks, trials };
}

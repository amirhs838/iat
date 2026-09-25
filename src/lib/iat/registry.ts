// =============================================================================
// Stimulus registry overlay — the DB Stimulus table is the runtime source of
// truth for stimulus paths/labels. Files uploaded via the admin panel are
// recorded there and take effect for NEW sessions without code changes.
// The static test-definition remains the structural fallback (block structure,
// timing, scoring) and the provenance of the seeded reference set.
// Reproducibility: every session stores its own plan (blockPlanJson) including
// the exact paths shown, so archived sessions are unaffected by later uploads.
// =============================================================================

import { db } from "@/lib/db";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";
import type { TestDefinition } from "@/lib/iat/types";

/**
 * Build the effective test definition for NEW sessions: structural fields from
 * the static definition, stimulus paths/labels overridden by the DB registry
 * (active rows of the given test version).
 */
export async function loadEffectiveDefinition(testVersionId: string): Promise<TestDefinition> {
  const rows = await db.stimulus.findMany({
    where: { testVersionId, active: true },
    select: { stimulusKey: true, path: true, label: true },
  });
  if (rows.length === 0) return IAT_TEST_DEFINITION;
  const byKey = new Map(rows.map((r) => [r.stimulusKey, r]));

  const override = <T extends { id: string; path: string; label?: string }>(
    exemplars: T[],
  ): T[] =>
    exemplars.map((ex) => {
      const row = byKey.get(ex.id);
      return row ? { ...ex, path: row.path, label: row.label ?? ex.label } : ex;
    });

  return {
    ...IAT_TEST_DEFINITION,
    targets: IAT_TEST_DEFINITION.targets.map((cat) => ({
      ...cat,
      exemplars: override(cat.exemplars),
    })),
    attributes: IAT_TEST_DEFINITION.attributes.map((cat) => ({
      ...cat,
      exemplars: override(cat.exemplars),
    })),
  };
}

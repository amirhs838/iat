// =============================================================================
// GET /api/admin/stimuli — stimulus registry + on-disk file presence check.
// Includes replacement instructions for the researcher.
// =============================================================================

import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { json } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/api-utils";
import { IAT_TEST_DEFINITION, STIMULUS_SPEC, STIMULUS_SPEC_GENERAL } from "@/config/iat/test-definition";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const stimuli = await db.stimulus.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  const withFileCheck = stimuli.map((s) => {
    let fileExists: boolean | null = null;
    if (s.type === "image") {
      const rel = s.path.replace(/^\//, "");
      fileExists = existsSync(join(process.cwd(), "public", rel));
    }
    return { ...s, fileExists };
  });

  // Per-slot spec for any row missing a description (defensive; seed writes them).
  const itemsWithSpec = withFileCheck.map((s) => ({
    ...s,
    description: s.description ?? STIMULUS_SPEC[s.stimulusKey] ?? null,
  }));

  const byCategorySpec = new Map<string, typeof itemsWithSpec>();
  for (const s of itemsWithSpec) {
    const list = byCategorySpec.get(s.category) ?? [];
    list.push(s);
    byCategorySpec.set(s.category, list);
  }

  return json({
    categories: [...byCategorySpec.entries()].map(([category, items]) => ({
      category,
      items,
      generalSpec: STIMULUS_SPEC_GENERAL[category] ?? null,
    })),
    total: stimuli.length,
    testVersion: {
      code: IAT_TEST_DEFINITION.code,
      version: IAT_TEST_DEFINITION.version,
    },
    replacementGuide: {
      targetImages:
        "Upload a new image per slot below (JPEG/PNG/WebP, ≥200×200 px, ≤8 MB). The seeded reference file is kept; uploads take effect for NEW sessions only (archived sessions keep the paths they ran with).",
      attributeWords: "Attribute words come from the standard IAT lists (Greenwald 1998/2003) and are edited in src/config/iat/test-definition.ts.",
      noEngineChanges: "Engine, scoring, randomization and DB are fully configuration-driven — replacing images requires no code changes.",
    },
  });
}

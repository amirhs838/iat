// =============================================================================
// GET   /api/admin/stimuli — stimulus registry + on-disk file presence check.
// PATCH /api/admin/stimuli — edit an attribute WORD (text/label) for NEW sessions.
// Includes replacement instructions for the researcher.
// =============================================================================

import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError, requireAdmin } from "@/lib/api-utils";
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
    if (s.type === "image" && s.path.startsWith("/iat/")) {
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
      attributeWords:
        "Attribute words are editable right on this page (type a new word and press save). Changes apply to NEW sessions only; archived sessions keep the words they ran with. Defaults come from the standard IAT lists (Greenwald 1998/2003).",
      noEngineChanges: "Engine, scoring, randomization and DB are fully configuration-driven — replacing images requires no code changes.",
    },
  });
}

// -----------------------------------------------------------------------------
// PATCH — edit one attribute word (and/or its admin label).
// Only word-type rows are editable here; image slots use the upload control.
// The edit is stored in the Stimulus registry, which overrides the static
// configuration for NEW sessions (see src/lib/iat/registry.ts). Archived
// sessions keep their snapshotted plan and are never affected.
// NOTE: rows are never deactivated from this panel — an inactive row would
// silently fall back to the static definition (registry filters active rows).
// -----------------------------------------------------------------------------

const PatchSchema = z.object({
  stimulusKey: z.string().trim().min(1).max(64),
  // Word text: trim ends; forbid control characters/line breaks; 1–40 chars.
  path: z
    .string()
    .trim()
    .min(1, "واژه نمی‌تواند خالی باشد")
    .max(40, "واژه حداکثر ۴۰ نویسه")
    .regex(/^[^\r\n\t\u0000-\u001f]+$/, "واژه نباید شامل نویسه‌های کنترلی باشد")
    .optional(),
  label: z.string().trim().max(80).nullish(),
});

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("validation failed", 422, { issues: parsed.error.issues?.slice(0, 5) });
  }
  const { stimulusKey, path, label } = parsed.data;

  const row = await db.stimulus.findUnique({ where: { stimulusKey } });
  if (!row) return jsonError("unknown stimulusKey", 404);
  if (row.type !== "word") {
    return jsonError("only attribute words can be edited here (image slots use the upload control)", 422);
  }

  const data: { path?: string; label?: string | null } = {};
  if (path !== undefined) data.path = path;
  if (label !== undefined) data.label = label ?? null;
  if (Object.keys(data).length === 0) {
    return jsonError("nothing to update", 422);
  }

  const updated = await db.stimulus.update({ where: { stimulusKey }, data });
  return json({ ok: true, stimulus: updated });
}

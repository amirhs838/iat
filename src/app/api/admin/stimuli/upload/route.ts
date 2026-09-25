// =============================================================================
// POST   /api/admin/stimuli/upload — replace a target-image slot (multipart).
// DELETE /api/admin/stimuli/upload — restore the seeded reference set for a slot.
//
// Replacement images are stored IN THE DATABASE (Stimulus.uploadedData, base64)
// and served through GET /api/stimuli-image/[key]. Database storage keeps the
// panel working on read-only serverless filesystems (e.g. Vercel), where
// writing under public/ at runtime is impossible.
//
// Effects: uploads take effect for NEW sessions only — every session snapshots
// its own trial plan (blockPlanJson), so archived sessions are never mutated.
// =============================================================================

import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, jsonError, requireAdmin } from "@/lib/api-utils";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MIN_DIMENSION = 200;
const TARGET_W = 480;
const TARGET_H = 600;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Reference path for a slot from the static (versioned) test definition. */
function referencePath(stimulusKey: string): string | null {
  for (const cat of [...IAT_TEST_DEFINITION.targets, ...IAT_TEST_DEFINITION.attributes]) {
    const ex = cat.exemplars.find((e) => e.id === stimulusKey);
    if (ex) return ex.path;
  }
  return null;
}

/** Best-effort cleanup of legacy on-disk `<key>-custom.*` uploads. */
async function cleanupLegacyCustomFile(publicPath: string): Promise<void> {
  if (!publicPath.startsWith("/iat/stimuli/") || !/-custom\.[a-z0-9]+$/i.test(publicPath)) return;
  const abs = join(process.cwd(), "public", publicPath.replace(/^\//, ""));
  if (existsSync(abs)) {
    try {
      await unlink(abs);
    } catch {
      // non-fatal
    }
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("expected multipart/form-data", 400);
  }

  const stimulusKey = String(form.get("stimulusKey") ?? "").trim();
  const file = form.get("file");
  if (!stimulusKey || !(file instanceof File)) {
    return jsonError("stimulusKey and file are required", 422);
  }

  const row = await db.stimulus.findUnique({ where: { stimulusKey } });
  if (!row) return jsonError("unknown stimulusKey", 404);
  if (row.type !== "image") {
    return jsonError("only image slots accept file uploads", 422);
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return jsonError("only JPEG, PNG or WebP images are allowed", 422);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return jsonError("uploaded file is empty", 422);
  if (bytes.byteLength > MAX_BYTES) return jsonError("file exceeds the 8 MB limit", 413);

  // Decodability + minimum size check (never trust the client MIME alone).
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(bytes).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return jsonError("file is not a readable image", 422);
  }
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return jsonError(
      `image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} pixels (got ${width}×${height})`,
      422,
    );
  }

  // Normalize every upload to the reference-set format: 480×600 JPEG,
  // attention crop keeps the face centered. EXIF rotation is respected.
  let processed: Buffer;
  try {
    processed = await sharp(bytes)
      .rotate()
      .resize(TARGET_W, TARGET_H, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    return jsonError("image processing failed — try another file", 422);
  }

  const uploadedAt = new Date();
  const path = `/api/stimuli-image/${encodeURIComponent(stimulusKey)}?v=${uploadedAt.getTime()}`;

  await db.stimulus.update({
    where: { stimulusKey },
    data: {
      path,
      uploadedData: processed.toString("base64"),
      uploadedMime: "image/jpeg",
      uploadedAt,
    },
  });

  // If an older on-disk upload exists, remove it (legacy flow).
  if (row.path.startsWith("/iat/stimuli/")) {
    await cleanupLegacyCustomFile(row.path);
  }

  return json({
    ok: true,
    stimulusKey,
    path,
    uploadedAt: uploadedAt.toISOString(),
  });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const parsed = z
    .object({ stimulusKey: z.string().trim().min(1).max(64) })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError("validation failed", 422, { issues: parsed.error.issues?.slice(0, 5) });
  }
  const { stimulusKey } = parsed.data;

  const row = await db.stimulus.findUnique({ where: { stimulusKey } });
  if (!row) return jsonError("unknown stimulusKey", 404);
  if (row.type !== "image") return jsonError("only image slots can be restored", 422);
  if (row.uploadedAt == null && !/-custom\.[a-z0-9]+$/i.test(row.path)) {
    return jsonError("slot already uses the reference image", 409);
  }

  const ref = referencePath(stimulusKey);
  if (!ref) return jsonError("no reference file registered for this slot", 500);

  await cleanupLegacyCustomFile(row.path);

  const updated = await db.stimulus.update({
    where: { stimulusKey },
    data: { path: ref, uploadedData: null, uploadedMime: null, uploadedAt: null },
  });

  return json({ ok: true, stimulusKey, path: updated.path });
}

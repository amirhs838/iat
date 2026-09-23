// =============================================================================
// POST /api/admin/stimuli/upload — replace one target stimulus image via the
// admin panel.
//
// Design (non-destructive):
//   • The seeded reference file is NEVER overwritten. Uploads are stored as
//     <stimulusKey>-custom.<ext> and the DB registry path is switched to the
//     uploaded file, so new sessions use it (registry overlay).
//   • Re-uploading replaces the previous custom file.
//   • DELETE (body: {stimulusKey}) restores the seeded reference: deletes the
//     custom file and resets the registry row (path → config default,
//     uploadedAt → null).
//
// Validation: admin session + same-origin (requireAdmin), stimulus must be an
// image-type target slot, JPEG/PNG/WebP, decodable, 8 MB max, ≥ 200×200 px.
// =============================================================================

import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { json, jsonError, requireAdmin } from "@/lib/api-utils";
import { IAT_TEST_DEFINITION } from "@/config/iat/test-definition";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const TARGET_CATEGORIES = new Set(IAT_TEST_DEFINITION.targets.map((t) => t.key));

/** Absolute directory for a category's stimulus files (path built from DB row, never raw user input). */
function categoryDir(category: string): string {
  return join(process.cwd(), "public", "iat", "stimuli", category);
}

async function removeCustomFiles(dir: string, stimulusKey: string): Promise<void> {
  for (const ext of Object.values(MIME_EXT)) {
    const p = join(dir, `${stimulusKey}-custom.${ext}`);
    if (existsSync(p)) await unlink(p).catch(() => {});
  }
}

function defaultPathFor(stimulusKey: string): string | null {
  for (const cat of IAT_TEST_DEFINITION.targets) {
    const ex = cat.exemplars.find((e) => e.id === stimulusKey);
    if (ex) return ex.path;
  }
  return null;
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

  const stimulusKey = String(form.get("stimulusKey") ?? "");
  const file = form.get("file");
  if (!stimulusKey) return jsonError("missing stimulusKey", 422);
  if (!(file instanceof File)) return jsonError("missing file", 422);

  const row = await db.stimulus.findUnique({ where: { stimulusKey } });
  if (!row) return jsonError("unknown stimulusKey", 404);
  if (row.type !== "image" || !TARGET_CATEGORIES.has(row.category)) {
    return jsonError("only target image slots can be replaced", 422);
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return jsonError("حجم فایل باید بین ۱ بایت و ۸ مگابایت باشد.", 422);
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return jsonError("قالب فایل پشتیبانی نمی‌شود — JPEG، PNG یا WebP لازم است.", 422);
  }

  // Verify the bytes decode as an image and meet minimum dimensions.
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
      return jsonError("ابعاد تصویر باید حداقل ۲۰۰×۲۰۰ پیکسل باشد.", 422);
    }
  } catch {
    return jsonError("فایل ارسالی یک تصویر معتبر نیست.", 422);
  }

  const dir = categoryDir(row.category);
  await mkdir(dir, { recursive: true });
  await removeCustomFiles(dir, stimulusKey); // drop previous custom version
  const fileName = `${stimulusKey}-custom.${ext}`;
  await writeFile(join(dir, fileName), buffer);

  const publicPath = `/iat/stimuli/${row.category}/${fileName}`;
  const updated = await db.stimulus.update({
    where: { stimulusKey },
    data: { path: publicPath, uploadedAt: new Date() },
  });

  return json({ ok: true, stimulus: updated });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const stimulusKey = String((bodyRaw as { stimulusKey?: unknown })?.stimulusKey ?? "");
  if (!stimulusKey) return jsonError("missing stimulusKey", 422);

  const row = await db.stimulus.findUnique({ where: { stimulusKey } });
  if (!row) return jsonError("unknown stimulusKey", 404);

  const restorePath = defaultPathFor(stimulusKey);
  if (!restorePath) return jsonError("slot has no seeded reference", 422);

  if (row.path.includes("-custom.")) {
    await removeCustomFiles(categoryDir(row.category), stimulusKey);
  }

  const updated = await db.stimulus.update({
    where: { stimulusKey },
    data: { path: restorePath, uploadedAt: null },
  });

  return json({ ok: true, stimulus: updated });
}

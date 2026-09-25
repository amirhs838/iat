// =============================================================================
// GET /api/stimuli-image/[key] — serve an admin-replaced stimulus image.
//
// - If the slot holds uploaded bytes (Stimulus.uploadedData) → serve them with
//   immutable caching (the path carries a ?v= version that changes on replace).
// - Otherwise (slot restored to the reference set) → 302 redirect to the
//   reference file under /public, so archived sessions never break.
//
// This route is PUBLIC: participants load their stimulus set through it after
// an admin replacement. No identifying data is exposed.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const stimulusKey = decodeURIComponent(key);

  const row = await db.stimulus.findUnique({
    where: { stimulusKey },
    select: { type: true, path: true, uploadedData: true, uploadedMime: true },
  });

  if (!row || row.type !== "image") {
    return new NextResponse("not found", { status: 404 });
  }

  if (row.uploadedData) {
    const buf = Buffer.from(row.uploadedData, "base64");
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": row.uploadedMime ?? "image/jpeg",
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Restored slot: redirect to the static reference file.
  try {
    const target = new URL(row.path, req.url);
    return NextResponse.redirect(target, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse("invalid reference path", { status: 500 });
  }
}

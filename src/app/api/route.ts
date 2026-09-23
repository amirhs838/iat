// =============================================================================
// GET /api — platform health check (used by uptime probes / deployment checks).
// =============================================================================

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "iat-platform",
    time: new Date().toISOString(),
  });
}

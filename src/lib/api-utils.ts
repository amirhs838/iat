// =============================================================================
// API helpers: JSON responses, admin guard, CSRF-origin check, IP extraction.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdminFromCookies, type AdminIdentity } from "@/lib/auth/session";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * CSRF mitigation for mutating requests.
 *
 * Primary signal: Fetch Metadata (`sec-fetch-site`) — set by the browser itself,
 * so it stays correct behind reverse proxies / preview gateways that rewrite the
 * Host header (a plain Origin-vs-Host comparison breaks in that setup).
 *   - same-origin | same-site  → allow (browser asserts the request is ours)
 *   - cross-site               → reject
 *   - absent (old browsers, curl) → fall back to the classic Origin/Referer
 *     check against x-forwarded-host (comma list) and host, first comparing the
 *     full host[:port] and then the bare hostname as a proxy-rewrite fallback.
 * If Origin and Referer are both absent (curl, beacons) the request is allowed.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return true; // non-browser clients (curl, beacons)

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
  if (fetchSite === "cross-site") {
    console.warn(
      "[sameOrigin] rejected cross-site request:",
      JSON.stringify({ origin, referer, fetchSite }),
    );
    return false;
  }

  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const candidates = [forwardedHost, req.headers.get("host")]
    .filter((h): h is string => Boolean(h))
    .flatMap((h) => {
      const lower = h.toLowerCase();
      return [lower, lower.split(":")[0]];
    });

  const source = origin ?? referer;
  if (!source) return true;
  try {
    const url = new URL(source);
    const sourceHost = url.host.toLowerCase();
    const sourceHostname = url.hostname.toLowerCase();
    if (candidates.includes(sourceHost) || candidates.includes(sourceHostname)) return true;
  } catch {
    return false;
  }

  console.warn(
    "[sameOrigin] rejected mutating request (header mismatch):",
    JSON.stringify({ origin, referer, host: req.headers.get("host"), xForwardedHost: forwardedHost, fetchSite }),
  );
  return false;
}

/** Guard for admin API routes. Returns the admin or a 401 response. */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ admin: AdminIdentity } | { response: NextResponse }> {
  if (!sameOrigin(req) && req.method !== "GET") {
    return { response: jsonError("cross-origin request rejected", 403) };
  }
  const admin = await getAdminFromCookies();
  if (!admin) {
    return { response: jsonError("unauthorized", 401) };
  }
  return { admin };
}

/** Parse & clamp integer query param. */
export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

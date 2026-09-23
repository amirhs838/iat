// =============================================================================
// In-memory rate limiter (MVP-level, per server instance).
// Used to throttle admin login attempts. Documented limitation: resets on
// server restart and is per-instance (single-instance deployments are the
// target for this self-hosted MVP).
// =============================================================================

const attempts = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();

export interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  lockoutMs: number;
}

const DEFAULTS: RateLimitOptions = { windowMs: 15 * 60 * 1000, maxAttempts: 5, lockoutMs: 15 * 60 * 1000 };

export function checkRateLimit(key: string, opts: Partial<RateLimitOptions> = {}): { allowed: boolean; retryAfterSec: number } {
  const { windowMs, maxAttempts, lockoutMs } = { ...DEFAULTS, ...opts };
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry) {
    if (entry.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (now - entry.firstAt > windowMs) {
      attempts.delete(key);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordFailedAttempt(key: string, opts: Partial<RateLimitOptions> = {}): void {
  const { windowMs, maxAttempts, lockoutMs } = { ...DEFAULTS, ...opts };
  const now = Date.now();
  const entry = attempts.get(key) ?? { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - entry.firstAt > windowMs) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count += 1;
  if (entry.count >= maxAttempts) {
    entry.lockedUntil = now + lockoutMs;
  }
  attempts.set(key, entry);
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

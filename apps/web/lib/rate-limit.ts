interface WindowCounter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, WindowCounter>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Small in-process guard for the MVP. Use a shared Redis-backed limiter when scaling out. */
export function takeRateLimit(
  key: string,
  limit = 3,
  windowMs = 10 * 60_000,
  now = Date.now(),
): RateLimitResult {
  const current = counters.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  counters.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function clearRateLimitsForTests(): void {
  counters.clear();
}

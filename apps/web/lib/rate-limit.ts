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

/**
 * One in-flight advisory job per milestone *version*, not per milestone.
 *
 * Keying by the evidence hash rather than just the milestone means a
 * resubmission immediately opens its own job instead of waiting out a lock
 * held by the version it just superseded — which, left unbounded, is also how
 * a single evidence hash could otherwise rack up a run of parallel OpenAI
 * calls from a reviewer double-clicking "Generate report". An in-process Set
 * is the same scaling caveat as `takeRateLimit` above: fine for one instance,
 * not for several behind a load balancer.
 */
const inFlightJobs = new Set<string>();
/** A lock is not held forever if a process dies mid-request. */
const JOB_LOCK_TTL_MS = 2 * 60_000;
const jobLockDeadlines = new Map<string, number>();

export function acquireJobLock(key: string, now = Date.now()): boolean {
  const deadline = jobLockDeadlines.get(key);
  if (deadline !== undefined && deadline <= now) {
    inFlightJobs.delete(key);
    jobLockDeadlines.delete(key);
  }
  if (inFlightJobs.has(key)) return false;
  inFlightJobs.add(key);
  jobLockDeadlines.set(key, now + JOB_LOCK_TTL_MS);
  return true;
}

export function releaseJobLock(key: string): void {
  inFlightJobs.delete(key);
  jobLockDeadlines.delete(key);
}

export function clearJobLocksForTests(): void {
  inFlightJobs.clear();
  jobLockDeadlines.clear();
}

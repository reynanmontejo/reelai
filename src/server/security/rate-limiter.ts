import 'server-only';

type Bucket = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly limit = 60, private readonly windowMs = 60_000) {}

  consume(key: string, now = Date.now()) {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return {
      allowed: current.count <= this.limit,
      remaining: Math.max(0, this.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
}

export const streamResolverRateLimiter = new FixedWindowRateLimiter();

export function requestClientKey(request: Request) {
  // Best effort for local/single-instance use. Production must configure a trusted
  // proxy and replace this with a distributed limiter.
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'local-anonymous';
}

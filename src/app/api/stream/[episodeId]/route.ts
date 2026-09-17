import { ApplicationError } from '@/lib/application-error';
import { requestClientKey, streamResolverRateLimiter } from '@/server/security/rate-limiter';
import { ServerStreamResolver } from '@/server/stream/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicError(error: unknown) {
  if (error instanceof ApplicationError) {
    const statuses: Partial<Record<typeof error.code, number>> = {
      INVALID_RESOLVER_REQUEST: 400,
      EPISODE_NOT_FOUND: 404,
      STREAM_NOT_FOUND: 404,
      ALL_SOURCES_FAILED: 503,
      PROVIDER_RATE_LIMITED: 429,
    };
    return Response.json({ error: { code: error.code, message: error.message } }, {
      status: statuses[error.code] || 503,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return Response.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Playback is temporarily unavailable.' } }, {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ episodeId: string }> }) {
  const rateLimit = streamResolverRateLimiter.consume(requestClientKey(request));
  if (!rateLimit.allowed) {
    return Response.json({ error: { code: 'PROVIDER_RATE_LIMITED', message: 'Too many playback requests. Please try again shortly.' } }, {
      status: 429,
      headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(rateLimit.retryAfterSeconds) },
    });
  }
  try {
    const { episodeId } = await params;
    const purpose = new URL(request.url).searchParams.get('purpose') || 'watch';
    if (!uuidPattern.test(episodeId) || (purpose !== 'watch' && purpose !== 'feed')) {
      throw new ApplicationError('INVALID_RESOLVER_REQUEST', 'The playback request is invalid.');
    }
    const candidates = await new ServerStreamResolver().resolve(episodeId, purpose);
    const hasExpiringSource = candidates.some((candidate) => Boolean(candidate.expiresAt));
    return Response.json({ candidates }, {
      headers: {
        'Cache-Control': hasExpiringSource ? 'private, no-store' : 'private, max-age=15',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return publicError(error);
  }
}

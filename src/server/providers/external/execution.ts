import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalProviderAdapter, ResolveStreamRequest } from '@/types/external-provider';
import type { StreamType } from '@/types/stream';

const validStreamTypes = new Set<StreamType>(['mp4', 'webm', 'hls', 'embed']);

function codeOf(error: unknown) {
  return error instanceof ApplicationError ? error.code : 'PROVIDER_UNAVAILABLE';
}

export async function executeProviderResolution(
  adapter: ExternalProviderAdapter,
  request: ResolveStreamRequest,
  options: { timeoutMs?: number; maxAttempts?: number; now?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxAttempts = options.maxAttempts ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const candidates = await Promise.race([
        adapter.resolveStreams(request),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ApplicationError('PROVIDER_TIMEOUT', 'The provider did not respond in time.')), timeoutMs);
        }),
      ]);
      if (!Array.isArray(candidates) || !candidates.length) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned no playback candidates.');
      }
      for (const candidate of candidates) {
        if (!validStreamTypes.has(candidate.type) || !candidate.url || !candidate.capabilities) {
          throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned malformed playback data.');
        }
        if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= (options.now ?? Date.now()) + 15_000) {
          throw new ApplicationError('SOURCE_EXPIRED', 'The provider returned an expired playback source.');
        }
      }
      return candidates;
    } catch (error) {
      lastError = error;
      const retryable = codeOf(error) === 'PROVIDER_TIMEOUT' || codeOf(error) === 'PROVIDER_UNAVAILABLE';
      if (!retryable || attempt + 1 >= maxAttempts) throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}

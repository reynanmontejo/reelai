import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError, type ApplicationErrorCode } from '@/lib/application-error';
import { getServerSupabaseClient } from '@/server/supabase/admin';
import { assertProviderHealthy, recordProviderFailure, recordProviderSuccess } from '@/server/providers/health';
import { ServerStreamResolver } from '@/server/stream/resolver';
import type { ExternalProviderAdapter } from '@/types/external-provider';

vi.mock('@/server/supabase/admin', () => ({ getServerSupabaseClient: vi.fn() }));
vi.mock('@/server/providers/health', () => ({ assertProviderHealthy: vi.fn(), recordProviderFailure: vi.fn(), recordProviderSuccess: vi.fn() }));

const capabilities = { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true };
const definition = { id: 'source-id', episode_id: 'episode-id', provider_id: 'test', external_reference: 'external-1', stream_purpose: 'both', priority: 10,
  resolution_mode: 'dynamic', static_stream_type: null, static_url: null, capabilities, allowed_hosts: [] };

function database(withDefinition = true, withFallback = false) {
  const rows: Record<string, unknown> = {
    episodes: { id: 'episode-id', is_published: true },
    stream_sources: withFallback ? [{ id: 'fallback', episode_id: 'episode-id', provider: 'owned', stream_type: 'mp4', stream_purpose: 'both', url: 'https://media.example.test/owned.mp4', priority: 20, capabilities }] : [],
    stream_source_definitions: withDefinition ? [definition] : [],
    provider_references: [{ provider: 'test', external_id: 'external-1' }],
  };
  const client = { from(table: string) {
    const result = Promise.resolve({ data: rows[table], error: null });
    const query = { select: () => query, eq: () => query, or: () => query, order: () => query,
      maybeSingle: () => result, then: result.then.bind(result) };
    return query;
  } };
  vi.mocked(getServerSupabaseClient).mockReturnValue(client as unknown as ReturnType<typeof getServerSupabaseClient>);
}

function resolver(resolveStreams: ExternalProviderAdapter['resolveStreams']) {
  const adapter: ExternalProviderAdapter = {
    id: 'test', name: 'Test', allowedHosts: ['media.example.test'],
    capabilities: { catalog: false, search: false, episodes: false, mp4: true, webm: false, hls: true, embed: false, watch: true, feed: true, metadataSync: false, expiringUrls: false },
    async getSeries() { throw new Error('unused'); }, async getEpisodes() { return []; }, resolveStreams,
  };
  return new ServerStreamResolver({ has: () => true, get: () => adapter });
}

beforeEach(() => { vi.resetAllMocks(); database(); });

describe('stream resolver failure handling', () => {
  it('resolves a valid active source and records provider success', async () => {
    const r = resolver(async () => [{ providerId: 'test', type: 'hls', url: 'https://media.example.test/episode.m3u8', capabilities }]);
    expect(await r.resolve('episode-id', 'watch')).toMatchObject([{ episodeId: 'episode-id', sourceDefinitionId: 'source-id', type: 'hls' }]);
    expect(recordProviderSuccess).toHaveBeenCalledWith('test');
  });

  it.each<ApplicationErrorCode>(['PROVIDER_RATE_LIMITED', 'SOURCE_EXPIRED', 'SOURCE_FORBIDDEN', 'PROVIDER_TIMEOUT'])('preserves %s instead of hiding it as a missing source', async code => {
    const r = resolver(async () => { throw new ApplicationError(code, 'private upstream detail'); });
    try { await r.resolve('episode-id', 'watch'); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect(error).toMatchObject({ code });
      expect((error as Error).message).not.toContain('private upstream detail');
    }
  });

  it('retains a valid fallback when another provider is rate-limited', async () => {
    database(true, true);
    const r = resolver(async () => { throw new ApplicationError('PROVIDER_RATE_LIMITED', 'limit'); });
    expect(await r.resolve('episode-id', 'watch')).toMatchObject([{ sourceDefinitionId: 'fallback' }]);
  });

  it('does not extend a cooldown when no provider call was attempted', async () => {
    vi.mocked(assertProviderHealthy).mockImplementation(() => { throw new ApplicationError('PROVIDER_UNAVAILABLE', 'cooldown'); });
    const resolveStreams = vi.fn<ExternalProviderAdapter['resolveStreams']>();
    await expect(resolver(resolveStreams).resolve('episode-id', 'watch')).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(resolveStreams).not.toHaveBeenCalled();
    expect(recordProviderFailure).not.toHaveBeenCalled();
  });

  it('distinguishes absent source configuration from a provider failure', async () => {
    database(false);
    await expect(resolver(async () => []).resolve('episode-id', 'watch')).rejects.toMatchObject({ code: 'ALL_SOURCES_FAILED' });
  });
});

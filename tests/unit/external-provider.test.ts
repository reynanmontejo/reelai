import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/lib/application-error';
import { CatalogImporter } from '@/server/import/catalog-importer';
import { executeProviderResolution } from '@/server/providers/external/execution';
import { createExternalProviderRegistry } from '@/server/providers/external/registry';
import type { ExternalProviderAdapter } from '@/types/external-provider';
import type { StreamType } from '@/types/stream';

const capabilities = { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true };

function adapter(resolveStreams: ExternalProviderAdapter['resolveStreams']): ExternalProviderAdapter {
  return {
    id: 'test-provider',
    name: 'Test provider',
    allowedHosts: ['media.example.test'],
    capabilities: {
      catalog: false, search: false, episodes: false, mp4: true, webm: true, hls: true,
      embed: true, watch: true, feed: true, metadataSync: false, expiringUrls: true,
    },
    async getSeries() { throw new Error('not used'); },
    async getEpisodes() { return []; },
    resolveStreams,
  };
}

describe('external provider registry and demo adapter', () => {
  it('requires explicit registration and rejects unknown providers', () => {
    const registry = createExternalProviderRegistry([]);
    expect(() => registry.get('reelai-demo')).toThrowError(ApplicationError);
    expect(() => createExternalProviderRegistry(['unknown'])).toThrowError(/Unknown configured external provider/);
  });

  it('normalizes catalog, watch, feed, MP4, HLS, and embed data', async () => {
    const registry = createExternalProviderRegistry(['reelai-demo']);
    const provider = registry.get('reelai-demo');
    const series = await provider.getSeries('demo-series:10000000-0000-4000-8000-000000000001');
    const episodes = await provider.getEpisodes(series.externalId);
    expect(series.slug).toBe('demo-the-ceos-second-chance');
    expect(episodes).toHaveLength(12);
    expect(episodes[0].sources.map((source) => source.purpose)).toEqual(['watch', 'feed']);
    expect(episodes[0].sources.map((source) => source.type)).toEqual(['mp4', 'mp4']);
    expect(episodes[1].sources[0].type).toBe('hls');
    expect(episodes[2].sources[0].type).toBe('embed');
  });

  it('prepares and dry-runs an import without database access', async () => {
    const importer = new CatalogImporter(createExternalProviderRegistry(['reelai-demo']));
    const result = await importer.import('reelai-demo', 'demo-series:10000000-0000-4000-8000-000000000001', { dryRun: true });
    expect(result).toMatchObject({ dryRun: true, episodeCount: 12, createdCount: 0, updatedCount: 0 });
  });

  it('returns an ordered owned mirror for playback fallback testing', async () => {
    const provider = createExternalProviderRegistry(['reelai-demo']).get('reelai-demo');
    const candidates = await provider.resolveStreams({
      externalEpisodeId: 'demo-episode:20000000-0000-4000-8000-000000000101',
      purpose: 'watch',
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].url).not.toBe(candidates[1].url);
    expect(candidates[1]).toMatchObject({ providerId: 'reelai-demo', type: 'mp4' });
    expect(candidates[1].url).toMatch(/^\/videos\/reel-[123]\.mp4$/);
  });
});

describe('provider execution policy', () => {
  const request = { externalEpisodeId: 'episode-1', purpose: 'watch' as const };

  it.each<StreamType>(['mp4', 'webm', 'hls', 'embed'])('accepts normalized %s candidates', async (type) => {
    const candidates = await executeProviderResolution(adapter(async () => [{
      providerId: 'test-provider', type, url: 'https://media.example.test/video', capabilities,
    }]), request);
    expect(candidates[0].type).toBe(type);
  });

  it('retries one transient provider failure and then succeeds', async () => {
    let attempts = 0;
    const candidates = await executeProviderResolution(adapter(async () => {
      attempts += 1;
      if (attempts === 1) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'temporary');
      return [{ providerId: 'test-provider', type: 'mp4', url: 'https://media.example.test/video.mp4', capabilities }];
    }), request, { maxAttempts: 2 });
    expect(attempts).toBe(2);
    expect(candidates).toHaveLength(1);
  });

  it('times out with bounded retries', async () => {
    let attempts = 0;
    const never = adapter(async () => {
      attempts += 1;
      return new Promise<never>(() => undefined);
    });
    await expect(executeProviderResolution(never, request, { timeoutMs: 5, maxAttempts: 2 })).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(attempts).toBe(2);
  });

  it('rejects expired and malformed candidates without retrying', async () => {
    const now = Date.now();
    await expect(executeProviderResolution(adapter(async () => [{
      providerId: 'test-provider', type: 'mp4', url: 'https://media.example.test/old.mp4', capabilities,
      expiresAt: new Date(now + 5_000).toISOString(),
    }]), request, { now })).rejects.toMatchObject({ code: 'SOURCE_EXPIRED' });

    await expect(executeProviderResolution(adapter(async () => [{
      providerId: 'test-provider', type: 'invalid' as StreamType, url: '', capabilities,
    }]), request)).rejects.toMatchObject({ code: 'MALFORMED_PROVIDER_RESPONSE' });
  });
});

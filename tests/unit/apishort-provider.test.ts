import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeProviderFetch } from '@/server/security/url-policy';
import { ApiShortClient, parseApiShortCatalog, parseApiShortDetail, parseApiShortEpisodes, parseApiShortPlayback, parseApiShortPlayableEpisodes } from '@/server/providers/external/apishort.client';
import { ApiShortMetadataAdapter } from '@/server/providers/external/apishort.provider';
import { CatalogImporter } from '@/server/import/catalog-importer';
import { createExternalProviderRegistry } from '@/server/providers/external/registry';

vi.mock('@/server/security/url-policy', async (original) => ({
  ...await original<typeof import('@/server/security/url-policy')>(),
  safeProviderFetch: vi.fn(),
}));

const payload = { data: [{
  code: 847788, id: 18550, name: 'Example Family Story', summary: 'A family story.',
  cover: 'https://akamai-static.shorttv.live/images/cover/example.jpg',
  episodes: 28, tags: [{ labelName: 'Family' }],
}] };
const detail = { data: payload.data[0] };
const episodes = { data: { code: 847788, totalEpisodes: 2, episodes: [
  { id: 123, episode: 2, duration: 65, video: 'discarded-media-reference' },
  { id: 122, episode: 1, duration: 57, video: 'discarded-media-reference' },
] } };

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe('APIShort verified catalog path', () => {
  it('uses the route code rather than database id, and never invents episodes or AI claims', async () => {
    const provider = new ApiShortMetadataAdapter({
      async getCatalog() { return parseApiShortCatalog(payload); },
      async getSeries(id) { return parseApiShortDetail(detail, id); },
      async getEpisodes(id) { return parseApiShortEpisodes(episodes, id); },
      async getPlayback() { return [{ url: 'https://akamai-static.shorttv.live/example.m3u8', expiresAt: new Date(Date.now() + 300_000).toISOString() }]; },
    });
    const titles = await provider.search('family');
    expect(titles[0]).toMatchObject({ externalId: 'shortmax:847788', poster: { usage: 'external-reference' } });
    expect(titles[0].isAiOriginal).toBeUndefined();
    const normalized = await provider.getEpisodes('shortmax:847788');
    expect(normalized.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    expect(normalized.every((episode) => episode.sources.length === 1 && episode.sources[0].resolutionMode === 'dynamic' && !episode.sources[0].url)).toBe(true);
    expect(JSON.stringify(normalized)).not.toContain('discarded-media-reference');
    expect(provider.capabilities).toMatchObject({ episodes: true, watch: true, feed: true, hls: true });
    await expect(provider.getSeries('shortmax:18550')).rejects.toMatchObject({ code: 'MALFORMED_PROVIDER_RESPONSE' });
    await expect(provider.resolveStreams({ externalEpisodeId: normalized[0].externalId, purpose: 'watch' }))
      .resolves.toMatchObject([{ type: 'hls', providerId: 'apishort-metadata' }]);
  });

  it('rejects mismatched series, duplicate episodes and partial episode responses', () => {
    expect(() => parseApiShortEpisodes(episodes, 'shortmax:999')).toThrow();
    expect(() => parseApiShortEpisodes({ data: { ...episodes.data, totalEpisodes: 3 } }, 'shortmax:847788')).toThrow();
    expect(() => parseApiShortEpisodes({ data: { ...episodes.data, episodes: [episodes.data.episodes[0], episodes.data.episodes[0]] } }, 'shortmax:847788')).toThrow();
  });

  it('deduplicates ranking entries and rejects changed schema, invalid codes and off-host artwork', () => {
    expect(() => parseApiShortCatalog({ results: [] })).toThrow();
    expect(parseApiShortCatalog({ data: [...payload.data, ...payload.data] })).toHaveLength(1);
    expect(() => parseApiShortCatalog({ data: [{ ...payload.data[0], code: '../123' }] })).toThrow();
    expect(() => parseApiShortCatalog({ data: [{ ...payload.data[0], cover: 'https://evil.example/a.jpg' }] })).toThrow();
  });

  it('normalizes string tags from detail responses as well as catalog label objects', () => {
    expect(parseApiShortDetail({ data: { ...payload.data[0], tags: ['Romance', 'Fantasy', 'Romance'] } }, 'shortmax:847788').genres)
      .toEqual(['Romance', 'Fantasy']);
    expect(parseApiShortCatalog(payload)[0].genres).toEqual(['Family']);
  });

  it('keeps upstream ranking labels out of genre filters', () => {
    const record = parseApiShortCatalog({ data: [{ ...payload.data[0], tags: ['Top Trending Top.2', 'Family', 'Most Searched Top.6'] }] })[0];
    expect(record.genres).toEqual(['Family']);
    expect(record.tags).toEqual(['Top Trending Top.2', 'Most Searched Top.6']);
  });

  it('deduplicates concurrent requests, caches metadata, and sends credentials only in headers', async () => {
    vi.mocked(safeProviderFetch).mockResolvedValue(Response.json(payload));
    const client = new ApiShortClient('test-only-secret');
    const [first, second] = await Promise.all([client.getCatalog(), client.getCatalog()]);
    first[0].title = 'Changed locally';
    expect(second[0].title).toBe('Example Family Story');
    expect((await client.getCatalog())[0].title).toBe('Example Family Story');
    expect(safeProviderFetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(safeProviderFetch).mock.calls[0];
    expect(url).not.toContain('test-only-secret');
    expect(options.init?.headers).toMatchObject({ 'X-API-Key': 'test-only-secret' });
    expect(options).toMatchObject({ maxRedirects: 0, allowedHosts: ['apishort.com'] });
  });

  it.each([401, 403, 429, 502])('fails explicitly on HTTP %s without mock fallback or retries', async (status) => {
    vi.mocked(safeProviderFetch).mockResolvedValue(new Response('{}', { status }));
    await expect(new ApiShortClient('').getCatalog()).rejects.toMatchObject({
      code: status === 429 ? 'PROVIDER_RATE_LIMITED' : status === 502 ? 'PROVIDER_UNAVAILABLE' : 'SOURCE_FORBIDDEN',
    });
    expect(safeProviderFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized chunked bodies and supports importer dry runs through the registry', async () => {
    vi.mocked(safeProviderFetch).mockResolvedValueOnce(new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'application/json' } }));
    await expect(new ApiShortClient('').getCatalog()).rejects.toMatchObject({ code: 'MALFORMED_PROVIDER_RESPONSE' });
    vi.mocked(safeProviderFetch).mockResolvedValueOnce(Response.json(detail)).mockResolvedValueOnce(Response.json(episodes));
    const importer = new CatalogImporter(createExternalProviderRegistry(['apishort-metadata']));
    await expect(importer.import('apishort-metadata', 'shortmax:847788', { dryRun: true }))
      .resolves.toMatchObject({ dryRun: true, episodeCount: 2, createdCount: 0 });
  });
});

describe('APIShort dynamic playback', () => {
  const now = Date.now();
  const playbackPayload = { data: { code: 847788, totalEpisodes: 1, episodes: [{
    id: 122, episode: 1, duration: 57, expires: Math.floor(now / 1000) + 3600,
    video: {
      video_1080: 'https://akamai-static.shorttv.live/test/1080.m3u8?auth_key=test-expiring-reference',
      video_720: 'https://akamai-static.shorttv.live/test/720.m3u8?auth_key=test-expiring-reference',
    },
  }] } };

  it('orders qualities, validates expiry and rejects mismatched source references', async () => {
    const candidates = parseApiShortPlayback(playbackPayload, 'shortmax:847788:episode:122', now);
    expect(candidates.map(c => new URL(c.url).pathname)).toEqual(['/test/1080.m3u8', '/test/720.m3u8']);
    expect(candidates.every(c => Date.parse(c.expiresAt) > now)).toBe(true);
    expect(() => parseApiShortPlayback(playbackPayload, 'shortmax:847788:episode:999', now)).toThrow();
    expect(() => parseApiShortPlayback(playbackPayload, 'shortmax:999:episode:122', now)).toThrow();
    expect(() => parseApiShortPlayback(playbackPayload, 'shortmax:847788:episode:122', now + 3600_000)).toThrow();
    const provider = new ApiShortMetadataAdapter();
    await expect(provider.resolveStreams({ externalEpisodeId: 'shortmax:847788:episode:122', externalSourceReference: 'wrong', purpose: 'feed' }))
      .rejects.toMatchObject({ code: 'INVALID_RESOLVER_REQUEST' });
  });

  it('validates every source before an import, using only one upstream episode call', async () => {
    vi.mocked(safeProviderFetch).mockResolvedValue(Response.json(playbackPayload));
    const client = new ApiShortClient('test-only-secret');
    expect(await client.getImportEpisodes('shortmax:847788')).toMatchObject([{ episodeNumber: 1 }]);
    expect(safeProviderFetch).toHaveBeenCalledTimes(1);
    const partial = structuredClone(playbackPayload);
    partial.data.totalEpisodes = 2;
    partial.data.episodes.push({ ...partial.data.episodes[0], id: 123, episode: 2, video: { video_1080: '', video_720: '' } });
    expect(() => parseApiShortPlayableEpisodes(partial, 'shortmax:847788')).toThrow();
    expect(() => parseApiShortPlayableEpisodes({ data: { code: 847788, totalEpisodes: 0, episodes: [] } }, 'shortmax:847788')).toThrow();
    await expect(client.getCatalogPage(0)).rejects.toMatchObject({ code: 'INVALID_CONTENT_DATA' });
    expect(safeProviderFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects off-host and non-HLS playback URLs', () => {
    const wrongHost = structuredClone(playbackPayload);
    wrongHost.data.episodes[0].video.video_1080 = 'https://evil.example/test.m3u8';
    expect(() => parseApiShortPlayback(wrongHost, 'shortmax:847788:episode:122', now)).toThrow();
    const wrongType = structuredClone(playbackPayload);
    wrongType.data.episodes[0].video.video_1080 = 'https://akamai-static.shorttv.live/test.html';
    expect(() => parseApiShortPlayback(wrongType, 'shortmax:847788:episode:122', now)).toThrow();
  });

  it('deduplicates playback requests and refreshes after expiry instead of reusing metadata cache', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(now);
      vi.mocked(safeProviderFetch).mockImplementation(async () => Response.json(playbackPayload));
      const client = new ApiShortClient('test-only-secret');
      await client.getEpisodes('shortmax:847788');
      await Promise.all([client.getPlayback('shortmax:847788:episode:122'), client.getPlayback('shortmax:847788:episode:122')]);
      expect(safeProviderFetch).toHaveBeenCalledTimes(2);
      await client.getPlayback('shortmax:847788:episode:122');
      expect(safeProviderFetch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(5 * 60_000 + 1);
      await client.getPlayback('shortmax:847788:episode:122');
      expect(safeProviderFetch).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
});

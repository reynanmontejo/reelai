import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/lib/application-error';
import {
  DramaBosClient,
  parseDramaBosEpisodeResponse,
  parseDramaBosExternalId,
  parseDramaBosSearchResponse,
  parseDramaBosSeriesResponse,
  type DramaBosClientLike,
} from '@/server/providers/external/dramabos.client';
import { DramaBosMetadataAdapter } from '@/server/providers/external/dramabos.provider';

const seriesPayload = {
  id: '7023',
  title: "The CEO's Secret Wife",
  cover: 'https://cdn.dramabos.live/video/dramabox/covers/7023.jpg',
  desc: 'A short-drama catalog description.',
  episodes: 2,
  genre: 'Romance, Drama',
  language: 'en',
  rating: 9.2,
  source: 'dramabox',
};

const episodePayload = {
  dramaId: '7023',
  totalEpisodes: 2,
  episodes: [
    { number: 2, title: 'Secrets Unveiled', thumbnail: 'https://cdn.dramabos.live/video/dramabox/thumbs/7023_ep2.jpg', duration: 88, locked: true },
    { number: 1, title: 'The Discovery', thumbnail: 'https://cdn.dramabos.live/video/dramabox/thumbs/7023_ep1.jpg', duration: 92, locked: false },
  ],
};

const client: DramaBosClientLike = {
  async search() { return parseDramaBosSearchResponse([seriesPayload], 'dramabox'); },
  async getSeries(id) { return parseDramaBosSeriesResponse(seriesPayload, id); },
  async getEpisodes(id) { return parseDramaBosEpisodeResponse(episodePayload, id); },
};

describe('DramaBos metadata provider', () => {
  it('normalizes documented catalog and search responses without playback capabilities', async () => {
    const adapter = new DramaBosMetadataAdapter(client);
    const series = await adapter.getSeries('dramabox:7023');
    const search = await adapter.search('secret wife');
    expect(series).toMatchObject({
      externalId: 'dramabox:7023',
      title: "The CEO's Secret Wife",
      genres: ['Romance', 'Drama'],
      poster: { usage: 'external-reference' },
      status: 'External metadata only',
    });
    expect(search).toHaveLength(1);
    expect(adapter.capabilities).toMatchObject({ catalog: true, search: true, episodes: true, watch: false, feed: false, hls: false });
  });

  it('sorts episodes, preserves stable provider identity, and creates no sources', async () => {
    const episodes = await new DramaBosMetadataAdapter(client).getEpisodes('dramabox:7023');
    expect(episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    expect(episodes.map((episode) => episode.externalId)).toEqual([
      'dramabox:7023:episode:1',
      'dramabox:7023:episode:2',
    ]);
    expect(episodes.every((episode) => episode.sources.length === 0)).toBe(true);
    expect(episodes[1].description).toContain('locked');
  });

  it('rejects unknown providers, off-CDN images, duplicate episodes, and playback', async () => {
    expect(() => parseDramaBosExternalId('unknown:7023')).toThrowError(ApplicationError);
    expect(() => parseDramaBosSeriesResponse({ ...seriesPayload, cover: 'https://example.test/poster.jpg' }, 'dramabox:7023'))
      .toThrowError(ApplicationError);
    expect(() => parseDramaBosEpisodeResponse({ ...episodePayload, episodes: [episodePayload.episodes[0], episodePayload.episodes[0]] }, 'dramabox:7023'))
      .toThrowError(ApplicationError);
    await expect(new DramaBosMetadataAdapter(client).resolveStreams()).rejects.toMatchObject({ code: 'STREAM_NOT_FOUND' });
  });

  it('fails before network access when the server API key is missing', async () => {
    await expect(new DramaBosClient('').getSeries('dramabox:7023'))
      .rejects.toMatchObject({ code: 'INVALID_BACKEND_CONFIGURATION' });
  });
});

import { describe, expect, it } from 'vitest';
import detailFixture from '../fixtures/apify-netshort-detail.json';
import episodeFixture from '../fixtures/apify-netshort-episodes.json';
import { ApplicationError } from '@/lib/application-error';
import {
  ApifyShortDramaClient,
  parseApifyNetShortDetail,
  parseApifyNetShortEpisodes,
  type ApifyShortDramaClientLike,
} from '@/server/providers/external/apify-short-drama.client';
import { ApifyNetShortMetadataAdapter } from '@/server/providers/external/apify-netshort.provider';

const seriesId = '2096855749602361346';

const client: ApifyShortDramaClientLike = {
  async getSeries(id) { return parseApifyNetShortDetail(detailFixture, id); },
  async getEpisodes(id) { return parseApifyNetShortEpisodes(episodeFixture, id); },
};

describe('Apify NetShort metadata provider', () => {
  it('normalizes series metadata without claiming AI or playback capabilities', async () => {
    const provider = new ApifyNetShortMetadataAdapter(client);
    const series = await provider.getSeries(seriesId);
    expect(series).toMatchObject({
      externalId: seriesId,
      title: 'The Devil I called Father',
      poster: { usage: 'external-reference' },
      status: 'Experimental metadata only',
    });
    expect(series.isAiOriginal).toBeUndefined();
    expect(provider.capabilities).toMatchObject({ catalog: true, episodes: true, search: false, watch: false, feed: false });
  });

  it('sorts episode metadata and strips every upstream playback source', async () => {
    const provider = new ApifyNetShortMetadataAdapter(client);
    const episodes = await provider.getEpisodes(seriesId);
    expect(episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2, 3]);
    expect(episodes.every((episode) => episode.sources.length === 0)).toBe(true);
    expect(JSON.stringify(episodes)).not.toContain('temporary-signed-source');
    expect(episodes[2].description).toContain('locked');
  });

  it('fails closed for wrong identities, hosts, duplicate episodes, and playback', async () => {
    expect(() => parseApifyNetShortDetail(detailFixture, '2096855749602361347')).toThrowError(ApplicationError);
    const badHost = structuredClone(detailFixture);
    badHost[0].data.items[0].image = 'https://images.example.test/poster.webp';
    expect(() => parseApifyNetShortDetail(badHost, seriesId)).toThrowError(ApplicationError);
    const duplicate = structuredClone(episodeFixture);
    duplicate[0].data.items[1].episodeNumber = 3;
    expect(() => parseApifyNetShortEpisodes(duplicate, seriesId)).toThrowError(ApplicationError);
    await expect(new ApifyNetShortMetadataAdapter(client).resolveStreams()).rejects.toMatchObject({ code: 'STREAM_NOT_FOUND' });
  });

  it('fails before network access when the server token is missing', async () => {
    await expect(new ApifyShortDramaClient('').getSeries(seriesId))
      .rejects.toMatchObject({ code: 'INVALID_BACKEND_CONFIGURATION' });
  });
});

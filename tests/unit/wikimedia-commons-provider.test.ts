import { describe, expect, it } from 'vitest';
import {
  parseWikimediaVideoResponse,
  type WikimediaCommonsClientLike,
  type WikimediaVideoRecord,
  WIKIMEDIA_AI_VIDEO_TITLES,
} from '@/server/providers/external/wikimedia-commons.client';
import {
  WikimediaCommonsAiAdapter,
  WIKIMEDIA_COMMONS_SERIES_ID,
} from '@/server/providers/external/wikimedia-commons.provider';

function video(index: number): WikimediaVideoRecord {
  const pageId = 145_639_802 - index;
  return {
    pageId,
    fileTitle: WIKIMEDIA_AI_VIDEO_TITLES[index],
    originalUrl: `https://upload.wikimedia.org/video-${pageId}.webm`,
    descriptionUrl: `https://commons.wikimedia.org/wiki/File:${pageId}`,
    thumbnailUrl: `https://thumb.wikimedia.org/video-${pageId}.jpg`,
    mime: 'video/webm',
    width: 512,
    height: index === 2 ? 1280 : 896,
    sizeBytes: 200_000,
    durationSeconds: index === 2 ? 40 : 2.184,
    artist: index === 2 ? 'Sora/OpenAI' : 'VideoPoet/Google',
    license: 'Public domain',
    sourceDate: '2024-02-15',
    derivatives: [
      { url: `https://upload.wikimedia.org/video-${pageId}-480.webm`, mime: 'video/webm; codecs="vp9"', width: 270, height: 480, bandwidth: 700_000 },
      { url: `https://upload.wikimedia.org/video-${pageId}-1080.webm`, mime: 'video/webm; codecs="vp9"', width: 608, height: 1080, bandwidth: 3_200_000 },
    ],
  };
}

const fakeClient: WikimediaCommonsClientLike = {
  async getVideos() { return [video(2), video(0), video(1)]; },
};

describe('Wikimedia Commons client parsing', () => {
  it('parses and validates a public-domain WebM response', () => {
    const records = parseWikimediaVideoResponse({
      query: {
        pages: {
          '145639802': {
            pageid: 145639802,
            title: WIKIMEDIA_AI_VIDEO_TITLES[0],
            videoinfo: [{
              url: 'https://upload.wikimedia.org/video.webm',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:video.webm',
              thumburl: 'https://thumb.wikimedia.org/video.jpg',
              mime: 'video/webm', width: 512, height: 896, size: 166765, duration: 2.184,
              extmetadata: { Artist: { value: 'VideoPoet/Google' }, LicenseShortName: { value: 'Public domain' } },
              derivatives: [{ src: 'https://upload.wikimedia.org/video-480.webm', type: 'video/webm; codecs="vp9"', width: 274, height: 480, bandwidth: 249488 }],
            }],
          },
        },
      },
    });
    expect(records[0]).toMatchObject({ pageId: 145639802, mime: 'video/webm', durationSeconds: 2.184, license: 'Public domain' });
  });

  it('rejects non-public-domain and off-host media records', () => {
    const baseInfo = {
      url: 'https://upload.wikimedia.org/video.webm',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:video.webm',
      thumburl: 'https://thumb.wikimedia.org/video.jpg',
      mime: 'video/webm', width: 512, height: 896, size: 100, duration: 2,
      extmetadata: { LicenseShortName: { value: 'All rights reserved' } },
      derivatives: [],
    };
    expect(() => parseWikimediaVideoResponse({ query: { pages: { 1: { pageid: 1, title: 'File:test.webm', videoinfo: [baseInfo] } } } }))
      .toThrow(/no longer marked public domain/);
    expect(() => parseWikimediaVideoResponse({ query: { pages: { 1: { pageid: 1, title: 'File:test.webm', videoinfo: [{ ...baseInfo, url: 'https://example.com/video.webm', extmetadata: { LicenseShortName: { value: 'Public domain' } } }] } } } }))
      .toThrow(/outside the provider allowlist/);
  });
});

describe('Wikimedia Commons AI provider', () => {
  it('normalizes the curated collection in deterministic episode order', async () => {
    const provider = new WikimediaCommonsAiAdapter(fakeClient);
    const series = await provider.getSeries(WIKIMEDIA_COMMONS_SERIES_ID);
    const episodes = await provider.getEpisodes(WIKIMEDIA_COMMONS_SERIES_ID);
    expect(series).toMatchObject({ title: 'Open AI Motion Lab', isAiOriginal: true });
    expect(episodes.map((episode) => episode.title)).toEqual(['Cat at the Piano', 'Popcorn Pup', 'Victoria Crowned Pigeon']);
    expect(episodes.every((episode) => episode.sources[0].purpose === 'both')).toBe(true);
    expect(episodes.every((episode) => episode.sources[0].type === 'webm')).toBe(true);
  });

  it('resolves an allowlisted 1080p WebM candidate and rejects unknown IDs', async () => {
    const provider = new WikimediaCommonsAiAdapter(fakeClient);
    const candidates = await provider.resolveStreams({ externalEpisodeId: 'commons-page:145639800', purpose: 'feed' });
    expect(candidates[0]).toMatchObject({ providerId: 'wikimedia-commons-ai', type: 'webm' });
    expect(candidates[0].url).toContain('-1080.webm');
    await expect(provider.resolveStreams({ externalEpisodeId: 'commons-page:missing', purpose: 'watch' }))
      .rejects.toMatchObject({ code: 'STREAM_NOT_FOUND' });
  });
});

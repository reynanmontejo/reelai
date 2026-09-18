import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/lib/application-error';
import { parseYouTubeOEmbed, type YouTubeEmbedClientLike } from '@/server/providers/external/youtube-embed.client';
import { YouTubeEmbedAdapter, YOUTUBE_AI_COLLECTION_ID } from '@/server/providers/external/youtube-embed.provider';

const records = [
  ['9oryIMNVtto', 'Air Head', 'shy kids'],
  ['DNyxZi9Gp_4', 'The Frost', 'Waymark'],
  ['sObLB1FWL9w', 'AI Film Festival 2023', 'Runway'],
] as const;

const client: YouTubeEmbedClientLike = {
  async getVideos(videoIds) {
    return videoIds.map((videoId) => {
      const record = records.find(([id]) => id === videoId);
      if (!record) throw new Error('unexpected test video');
      return {
        videoId,
        title: record[1],
        authorName: record[2],
        authorUrl: `https://www.youtube.com/@${record[2].replaceAll(' ', '')}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    });
  },
};

describe('YouTube embed provider', () => {
  it('normalizes the curated AI collection and creates dynamic embed definitions', async () => {
    const provider = new YouTubeEmbedAdapter(client);
    const series = await provider.getSeries(YOUTUBE_AI_COLLECTION_ID);
    const episodes = await provider.getEpisodes(YOUTUBE_AI_COLLECTION_ID);

    expect(series).toMatchObject({ slug: 'youtube-ai-short-film-showcase', isAiOriginal: true });
    expect(episodes).toHaveLength(3);
    expect(episodes[0]).toMatchObject({
      externalId: 'youtube-video:9oryIMNVtto',
      episodeNumber: 1,
      sources: [{ purpose: 'both', resolutionMode: 'dynamic', type: 'embed' }],
    });
  });

  it('resolves only curated videos to the privacy-enhanced YouTube host', async () => {
    const provider = new YouTubeEmbedAdapter(client);
    const candidates = await provider.resolveStreams({
      externalEpisodeId: 'youtube-video:9oryIMNVtto',
      externalSourceReference: 'youtube-embed:9oryIMNVtto',
      purpose: 'feed',
    });
    expect(candidates).toEqual([expect.objectContaining({
      providerId: 'youtube-embed',
      type: 'embed',
      url: expect.stringMatching(/^https:\/\/www\.youtube-nocookie\.com\/embed\/9oryIMNVtto\?/),
    })]);
    await expect(provider.resolveStreams({ externalEpisodeId: 'youtube-video:AAAAAAAAAAA', purpose: 'watch' }))
      .rejects.toMatchObject({ code: 'STREAM_NOT_FOUND' });
  });

  it('validates oEmbed identity and thumbnail provenance', () => {
    expect(parseYouTubeOEmbed('9oryIMNVtto', {
      provider_name: 'YouTube',
      title: 'Air Head',
      author_name: 'shy kids',
      author_url: 'https://www.youtube.com/@shykids',
      thumbnail_url: 'https://i.ytimg.com/vi/9oryIMNVtto/hqdefault.jpg',
    })).toMatchObject({ videoId: '9oryIMNVtto', title: 'Air Head' });

    expect(() => parseYouTubeOEmbed('9oryIMNVtto', {
      provider_name: 'YouTube', title: 'Air Head', author_name: 'shy kids',
      thumbnail_url: 'https://images.example.test/poster.jpg',
    })).toThrowError(ApplicationError);
  });
});

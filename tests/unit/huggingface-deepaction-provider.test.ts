import { describe, expect, it } from 'vitest';
import { deepActionVideoUrl, type DeepActionClientLike } from '@/server/providers/external/huggingface-deepaction.client';
import {
  DEEPACTION_SERIES_ID,
  HuggingFaceDeepActionAdapter,
} from '@/server/providers/external/huggingface-deepaction.provider';

const client: DeepActionClientLike = {
  async verifyDataset() { return { revision: 'test-revision', license: 'CC BY 4.0' }; },
};

describe('Hugging Face DeepAction provider', () => {
  it('normalizes five licensed MP4 variants with owned artwork', async () => {
    const provider = new HuggingFaceDeepActionAdapter(client);
    const series = await provider.getSeries(DEEPACTION_SERIES_ID);
    const episodes = await provider.getEpisodes(DEEPACTION_SERIES_ID);
    expect(series).toMatchObject({ title: 'AI Motion Studies: Selfie', poster: { usage: 'owned' } });
    expect(episodes).toHaveLength(5);
    expect(episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(episodes.every((episode) => episode.sources[0].type === 'mp4' && episode.sources[0].purpose === 'both')).toBe(true);
  });

  it('resolves only the curated RunwayML paths', async () => {
    const provider = new HuggingFaceDeepActionAdapter(client);
    const candidates = await provider.resolveStreams({ externalEpisodeId: 'deepaction:runwayml:37:c', purpose: 'watch' });
    expect(candidates[0]).toMatchObject({ providerId: 'huggingface-deepaction', type: 'mp4' });
    expect(candidates[0].url).toContain('/RunwayML/37/c.mp4');
    expect(() => deepActionVideoUrl('Pexels/37/a.mp4')).toThrow(/outside the curated collection/);
    await expect(provider.resolveStreams({ externalEpisodeId: 'deepaction:missing', purpose: 'feed' }))
      .rejects.toMatchObject({ code: 'STREAM_NOT_FOUND' });
  });

  it('supports collection search without exposing the broader dataset', async () => {
    const provider = new HuggingFaceDeepActionAdapter(client);
    await expect(provider.search('selfie')).resolves.toHaveLength(1);
    await expect(provider.search('cooking')).resolves.toEqual([]);
    await expect(provider.search('')).resolves.toEqual([]);
  });
});

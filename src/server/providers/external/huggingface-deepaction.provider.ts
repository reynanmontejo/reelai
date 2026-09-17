import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';
import {
  deepActionVideoUrl,
  HuggingFaceDeepActionClient,
  type DeepActionClientLike,
} from './huggingface-deepaction.client';

export const DEEPACTION_PROVIDER_ID = 'huggingface-deepaction';
export const DEEPACTION_SERIES_ID = 'deepaction:runwayml:selfie-37';

const CLIPS = ['a', 'b', 'c', 'd', 'e'].map((variant, index) => ({
  externalId: `deepaction:runwayml:37:${variant}`,
  episodeNumber: index + 1,
  title: `Selfie Study ${index + 1}`,
  path: `RunwayML/37/${variant}.mp4`,
}));

const NATIVE_CAPABILITIES = {
  progressTracking: true,
  seek: true,
  pictureInPicture: true,
  playbackRate: true,
} as const;

function sourceReference(path: string) {
  return `deepaction-file:${path}`;
}

export class HuggingFaceDeepActionAdapter implements ExternalProviderAdapter {
  readonly id = DEEPACTION_PROVIDER_ID;
  readonly name = 'DeepAction AI Video Dataset';
  readonly allowedHosts = ['huggingface.co'] as const;
  readonly allowRelativeUrls = true;
  readonly capabilities = {
    catalog: true,
    search: true,
    episodes: true,
    mp4: true,
    webm: false,
    hls: false,
    embed: false,
    watch: true,
    feed: true,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  constructor(private readonly client: DeepActionClientLike = new HuggingFaceDeepActionClient()) {}

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized || !['motion', 'selfie', 'runway', 'deepaction', 'ai action'].some((term) => term.includes(normalized) || normalized.includes(term))) return [];
    await this.client.verifyDataset();
    return [this.series()];
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    if (externalId !== DEEPACTION_SERIES_ID) throw new ApplicationError('SERIES_NOT_FOUND', 'The DeepAction collection was not found.');
    await this.client.verifyDataset();
    return this.series();
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    if (externalSeriesId !== DEEPACTION_SERIES_ID) throw new ApplicationError('SERIES_NOT_FOUND', 'The DeepAction collection was not found.');
    await this.client.verifyDataset();
    return CLIPS.map((clip) => ({
      externalId: clip.externalId,
      episodeNumber: clip.episodeNumber,
      title: clip.title,
      description: 'A RunwayML interpretation of the prompt “A person taking a selfie,” from the DeepAction research dataset.',
      thumbnail: {
        url: '/images/deepaction-motion-lab.png',
        usage: 'owned',
        attribution: 'ReelAI original collection artwork. Video: DeepAction dataset by Matyas Bohacek and Hany Farid, CC BY 4.0.',
      },
      durationSeconds: 11,
      sources: [{
        externalReference: sourceReference(clip.path),
        purpose: 'both',
        priority: 10,
        resolutionMode: 'dynamic',
        type: 'mp4',
        capabilities: NATIVE_CAPABILITIES,
        allowedHosts: ['huggingface.co'],
      }],
    }));
  }

  async resolveStreams(request: ResolveStreamRequest) {
    await this.client.verifyDataset();
    const clip = CLIPS.find((item) => item.externalId === request.externalEpisodeId);
    if (!clip || (request.externalSourceReference && request.externalSourceReference !== sourceReference(clip.path))) {
      throw new ApplicationError('STREAM_NOT_FOUND', 'The DeepAction video source was not found.');
    }
    return [{
      providerId: this.id,
      type: 'mp4' as const,
      url: deepActionVideoUrl(clip.path),
      capabilities: NATIVE_CAPABILITIES,
    }];
  }

  private series(): ExternalSeries {
    return {
      externalId: DEEPACTION_SERIES_ID,
      slug: 'deepaction-selfie-studies',
      title: 'AI Motion Studies: Selfie',
      alternativeTitle: 'DeepAction RunwayML Collection',
      description: 'Five licensed AI-generated interpretations of the same everyday action, curated from the DeepAction human-motion research dataset.',
      poster: {
        url: '/images/deepaction-motion-lab.png',
        usage: 'owned',
        attribution: 'ReelAI original collection artwork.',
      },
      status: 'CC BY 4.0 research collection',
      genres: ['AI', 'Experimental'],
      tags: ['Human motion', 'RunwayML', 'DeepAction', 'CC BY 4.0'],
      isAiOriginal: true,
      badge: 'LICENSED AI VIDEO',
    };
  }
}

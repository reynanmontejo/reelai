import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';
import {
  DramaFrenClient,
  DRAMAFREN_ALLOWED_EMBED_HOSTS,
  type DramaFrenClientLike,
} from './dramafren.client';

export const DRAMAFREN_PROVIDER_ID = 'dramafren-authorized';
export const DRAMAFREN_TEST_SERIES_ID = 'under-one-roof-double-love-story';

const EMBED_CAPABILITIES = {
  progressTracking: false,
  seek: false,
  pictureInPicture: false,
  playbackRate: false,
} as const;

export class DramaFrenAuthorizedAdapter implements ExternalProviderAdapter {
  readonly id = DRAMAFREN_PROVIDER_ID;
  readonly name = 'DramaFren authorized embed';
  readonly allowedHosts = ['dramafren.org', ...DRAMAFREN_ALLOWED_EMBED_HOSTS] as const;
  readonly allowedEmbedHosts = DRAMAFREN_ALLOWED_EMBED_HOSTS;
  readonly capabilities = {
    catalog: true,
    search: true,
    episodes: true,
    mp4: false,
    webm: false,
    hls: false,
    embed: true,
    watch: true,
    feed: false,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  constructor(private readonly client: DramaFrenClientLike = new DramaFrenClient()) {}

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const series = await this.getSeries(DRAMAFREN_TEST_SERIES_ID);
    return `${series.title} ${series.alternativeTitle || ''}`.toLowerCase().includes(normalized) ? [series] : [];
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    this.assertCurated(externalId);
    const record = await this.client.getSeries(externalId);
    return {
      externalId,
      slug: `dramafren-${record.slug}`,
      title: record.title,
      alternativeTitle: 'DramaFren authorized test import',
      description: record.description,
      poster: {
        url: record.posterUrl,
        usage: 'external-authorized',
        attribution: `Poster supplied by DramaFren for the authorized ${record.title} integration.`,
      },
      status: record.status || 'Available',
      genres: ['Drama', 'Short'],
      tags: ['DramaFren', 'Authorized embed', 'External catalog'],
      isAiOriginal: false,
      badge: 'AUTHORIZED EXTERNAL',
    };
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    this.assertCurated(externalSeriesId);
    const record = await this.client.getSeries(externalSeriesId);
    return [{
      externalId: `dramafren:${externalSeriesId}:full`,
      episodeNumber: 1,
      title: 'Full Episodes',
      description: `Authorized embedded playback for ${record.title}.`,
      thumbnail: {
        url: record.posterUrl,
        usage: 'external-authorized',
        attribution: `Poster supplied by DramaFren for the authorized ${record.title} integration.`,
      },
      sources: [{
        externalReference: `dramafren-watch:${externalSeriesId}`,
        purpose: 'watch',
        priority: 10,
        resolutionMode: 'dynamic',
        type: 'embed',
        capabilities: EMBED_CAPABILITIES,
        allowedHosts: [...DRAMAFREN_ALLOWED_EMBED_HOSTS],
      }],
    }];
  }

  async resolveStreams(request: ResolveStreamRequest) {
    const expectedEpisodeId = `dramafren:${DRAMAFREN_TEST_SERIES_ID}:full`;
    const expectedReference = `dramafren-watch:${DRAMAFREN_TEST_SERIES_ID}`;
    if (request.purpose !== 'watch' || request.externalEpisodeId !== expectedEpisodeId
      || (request.externalSourceReference && request.externalSourceReference !== expectedReference)) {
      throw new ApplicationError('STREAM_NOT_FOUND', 'The authorized DramaFren embed was not found.');
    }
    const watch = await this.client.getWatch(DRAMAFREN_TEST_SERIES_ID);
    return [{ providerId: this.id, type: 'embed' as const, url: watch.iframeUrl, capabilities: EMBED_CAPABILITIES }];
  }

  private assertCurated(externalId: string) {
    if (externalId !== DRAMAFREN_TEST_SERIES_ID) {
      throw new ApplicationError('SERIES_NOT_FOUND', 'This DramaFren title is not in the authorized test allowlist.');
    }
  }
}

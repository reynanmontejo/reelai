import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries } from '@/types/external-provider';
import {
  ApifyShortDramaClient,
  type ApifyNetShortSeriesRecord,
  type ApifyShortDramaClientLike,
} from './apify-short-drama.client';

export const APIFY_NETSHORT_PROVIDER_ID = 'apify-netshort-metadata';

function slugPart(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'series';
}

function attribution(title: string) {
  return `${title} metadata and image reference supplied by NetShort through the configured Apify Actor.`;
}

export class ApifyNetShortMetadataAdapter implements ExternalProviderAdapter {
  readonly id = APIFY_NETSHORT_PROVIDER_ID;
  readonly name = 'Apify NetShort metadata';
  readonly allowedHosts = ['api.apify.com', 'awscover.netshort.com', 'static.netshort.com'] as const;
  readonly capabilities = {
    catalog: true,
    search: false,
    episodes: true,
    mp4: false,
    webm: false,
    hls: false,
    embed: false,
    watch: false,
    feed: false,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  constructor(private readonly client: ApifyShortDramaClientLike = new ApifyShortDramaClient()) {}

  async getSeries(externalId: string): Promise<ExternalSeries> {
    return this.mapSeries(await this.client.getSeries(externalId));
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    const episodes = await this.client.getEpisodes(externalSeriesId);
    return episodes.map((episode) => ({
      externalId: episode.id,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      description: episode.isLocked
        ? 'Episode metadata is available, but playback is locked by the upstream provider.'
        : 'Episode metadata is available. ReelAI has no authorized playback source for this provider.',
      thumbnail: episode.image ? {
        url: episode.image,
        usage: 'external-reference',
        attribution: `NetShort episode image reference for ${episode.title}.`,
      } : undefined,
      sources: [],
    }));
  }

  async resolveStreams(): Promise<never> {
    throw new ApplicationError('STREAM_NOT_FOUND', 'This provider is configured for metadata only; playback is unavailable.');
  }

  private mapSeries(record: ApifyNetShortSeriesRecord): ExternalSeries {
    const tags = [...new Set(['NetShort', 'External catalog', 'Metadata only', ...record.tags])];
    return {
      externalId: record.id,
      slug: `netshort-${slugPart(record.title)}-${record.id}`,
      title: record.title,
      alternativeTitle: 'NetShort metadata-only test import',
      description: record.description,
      poster: {
        url: record.image,
        usage: 'external-reference',
        attribution: attribution(record.title),
      },
      status: 'Experimental metadata only',
      genres: ['Short Drama'],
      tags,
      badge: 'METADATA ONLY',
    };
  }
}

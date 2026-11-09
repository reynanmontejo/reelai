import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries } from '@/types/external-provider';
import { DramaBosClient, type DramaBosClientLike, type DramaBosSeriesRecord } from './dramabos.client';

export const DRAMABOS_PROVIDER_ID = 'dramabos-metadata';

function slugPart(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'series';
}

export class DramaBosMetadataAdapter implements ExternalProviderAdapter {
  readonly id = DRAMABOS_PROVIDER_ID;
  readonly name = 'DramaBos metadata';
  readonly allowedHosts = ['dramabos.live', 'cdn.dramabos.live'] as const;
  readonly capabilities = {
    catalog: true,
    search: true,
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

  constructor(private readonly client: DramaBosClientLike = new DramaBosClient()) {}

  async search(query: string) {
    return Promise.all((await this.client.search(query)).map((record) => this.mapSeries(record)));
  }

  async getSeries(externalId: string) {
    return this.mapSeries(await this.client.getSeries(externalId));
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    const episodes = await this.client.getEpisodes(externalSeriesId);
    return episodes.map((episode) => ({
      externalId: episode.externalId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      description: episode.locked
        ? 'Episode metadata is available, but the upstream record is marked locked.'
        : 'Episode metadata supplied by DramaBos. ReelAI has no verified playback rights for this record.',
      thumbnail: episode.thumbnail ? {
        url: episode.thumbnail,
        usage: 'external-reference',
        attribution: `Episode image reference supplied by DramaBos for ${episode.title}.`,
      } : undefined,
      durationSeconds: episode.durationSeconds,
      sources: [],
    }));
  }

  async resolveStreams(): Promise<never> {
    throw new ApplicationError('STREAM_NOT_FOUND', 'DramaBos is configured for metadata only; playback rights have not been verified.');
  }

  private mapSeries(record: DramaBosSeriesRecord): ExternalSeries {
    const genres = record.genres.length ? record.genres : ['Short Drama'];
    const description = record.description
      || `Catalog metadata for ${record.title}, supplied by DramaBos from the ${record.provider} provider.`;
    return {
      externalId: record.externalId,
      slug: `dramabos-${record.provider}-${slugPart(record.title)}-${slugPart(record.providerSeriesId)}`,
      title: record.title,
      alternativeTitle: `${record.provider} catalog record`,
      description,
      poster: {
        url: record.cover,
        usage: 'external-reference',
        attribution: `${record.title} image reference supplied by DramaBos from ${record.provider}.`,
      },
      status: 'External metadata only',
      genres,
      tags: ['DramaBos', record.provider, 'External catalog', 'Metadata only'],
      badge: 'METADATA ONLY',
    };
  }
}

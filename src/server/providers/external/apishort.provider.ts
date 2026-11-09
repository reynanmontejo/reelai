import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';
import { ApiShortClient, type ApiShortClientLike, type ApiShortTitle } from './apishort.client';

export class ApiShortMetadataAdapter implements ExternalProviderAdapter {
  readonly id = 'apishort-metadata';
  readonly name = 'APIShort ShortMax catalog';
  readonly allowedHosts = ['apishort.com', 'akamai-static.shorttv.live'] as const;
  readonly capabilities = {
    catalog: true, search: true, episodes: true, metadataSync: true,
    mp4: false, webm: false, hls: true, embed: false, watch: true, feed: true, expiringUrls: true,
  } as const;

  constructor(private readonly client: ApiShortClientLike = new ApiShortClient()) {}

  async search(query: string): Promise<ExternalSeries[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length > 200) return [];
    // Search the one cached catalog page; this does not issue a separate upstream search.
    return (await this.client.getCatalog())
      .filter((title) => !normalized || `${title.title} ${title.description} ${title.genres.join(' ')}`.toLocaleLowerCase().includes(normalized))
      .map(mapSeries);
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    return mapSeries(await this.client.getSeries(externalId));
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    return (await this.client.getEpisodes(externalSeriesId)).map((episode) => ({
      externalId: episode.externalId,
      episodeNumber: episode.episodeNumber,
      title: `Episode ${episode.episodeNumber}`,
      durationSeconds: episode.durationSeconds,
      sources: [{
        externalReference: episode.externalId,
        purpose: 'both',
        priority: 10,
        resolutionMode: 'dynamic',
        type: 'hls',
        capabilities: { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true },
      }],
    }));
  }

  async resolveStreams(request: ResolveStreamRequest) {
    if (request.externalSourceReference && request.externalSourceReference !== request.externalEpisodeId) {
      throw new ApplicationError('INVALID_RESOLVER_REQUEST', 'The APIShort source reference does not match the requested episode.');
    }
    return (await this.client.getPlayback(request.externalEpisodeId)).map((candidate) => ({
      ...candidate,
      providerId: this.id,
      type: 'hls' as const,
      capabilities: { progressTracking: true, seek: true, pictureInPicture: true, playbackRate: true },
    }));
  }
}

function mapSeries(title: ApiShortTitle): ExternalSeries {
  return {
    externalId: title.externalId,
    slug: `apishort-shortmax-${title.externalId.split(':')[1]}`,
    title: title.title,
    description: title.description,
    poster: { url: title.posterUrl, usage: 'external-reference', attribution: 'ShortMax catalog image reference via APIShort.' },
    genres: title.genres,
    tags: ['APIShort', 'ShortMax', ...(title.tags || [])],
    status: 'External catalog',
    badge: 'SHORT DRAMA',
  };
}

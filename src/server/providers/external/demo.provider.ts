import 'server-only';

import { mockEpisodeSeed, mockFeedStreamSeed, mockSeriesSeed, mockStreamSeed } from '@/lib/data';
import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';

const DEMO_PROVIDER_ID = 'reelai-demo';
const LOCAL_MIRRORS = ['/videos/reel-1.mp4', '/videos/reel-2.mp4', '/videos/reel-3.mp4'] as const;
const LOCAL_MIRROR_CAPABILITIES = {
  progressTracking: true,
  seek: true,
  pictureInPicture: true,
  playbackRate: true,
} as const;

function externalSeriesId(internalId: string) {
  return `demo-series:${internalId}`;
}

function externalEpisodeId(internalId: string) {
  return `demo-episode:${internalId}`;
}

function sourceReference(id: string) {
  return `demo-source:${id}`;
}

export class DemoExternalProviderAdapter implements ExternalProviderAdapter {
  readonly id = DEMO_PROVIDER_ID;
  readonly name = 'ReelAI owned demo media';
  readonly allowedHosts = ['test-streams.mux.dev', 'www.youtube-nocookie.com'] as const;
  readonly allowedEmbedHosts = ['www.youtube-nocookie.com'] as const;
  readonly allowRelativeUrls = true;
  readonly capabilities = {
    catalog: true,
    search: true,
    episodes: true,
    mp4: true,
    webm: false,
    hls: true,
    embed: true,
    watch: true,
    feed: true,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    return mockSeriesSeed.filter((series) => series.title.toLowerCase().includes(normalized)).map((series) => this.mapSeries(series.id));
  }

  async getSeries(id: string) {
    const internalId = id.startsWith('demo-series:') ? id.slice('demo-series:'.length) : id;
    const series = mockSeriesSeed.find((item) => item.id === internalId);
    if (!series) throw new ApplicationError('SERIES_NOT_FOUND', 'The demo series was not found.', { context: { externalId: id } });
    return this.mapSeries(series.id);
  }

  async getEpisodes(seriesId: string): Promise<ExternalEpisode[]> {
    const internalSeriesId = seriesId.startsWith('demo-series:') ? seriesId.slice('demo-series:'.length) : seriesId;
    return mockEpisodeSeed.filter((episode) => episode.seriesId === internalSeriesId).map((episode) => ({
      externalId: externalEpisodeId(episode.id),
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      description: episode.description,
      thumbnail: episode.thumbnailUrl ? { url: episode.thumbnailUrl, usage: 'owned' } : undefined,
      durationSeconds: episode.durationSeconds,
      releaseDate: episode.releaseDate,
      sources: [
        ...mockStreamSeed.filter((source) => source.episodeId === episode.id).map((source) => ({
          externalReference: sourceReference(source.id),
          purpose: 'watch' as const,
          priority: source.priority,
          resolutionMode: 'dynamic' as const,
          type: source.type,
          capabilities: source.capabilities,
          allowedHosts: this.allowedHostsFor(source.url),
        })),
        ...mockFeedStreamSeed.filter((source) => source.episodeId === episode.id).map((source) => ({
          externalReference: sourceReference(source.id),
          purpose: 'feed' as const,
          priority: source.priority,
          resolutionMode: 'dynamic' as const,
          type: source.type,
          capabilities: source.capabilities,
          allowedHosts: this.allowedHostsFor(source.url),
        })),
      ],
    }));
  }

  async resolveStreams(request: ResolveStreamRequest) {
    const internalEpisodeId = request.externalEpisodeId.startsWith('demo-episode:')
      ? request.externalEpisodeId.slice('demo-episode:'.length)
      : request.externalEpisodeId;
    const sources = request.purpose === 'feed' ? mockFeedStreamSeed : mockStreamSeed;
    const source = sources.find((candidate) => candidate.episodeId === internalEpisodeId
      && (!request.externalSourceReference || sourceReference(candidate.id) === request.externalSourceReference));
    if (!source) throw new ApplicationError('STREAM_NOT_FOUND', 'The demo source was not found.');
    const primary = {
      providerId: this.id,
      type: source.type,
      url: process.env.REELAI_DEMO_FAIL_PRIMARY === '1' ? '/videos/__missing-primary__.mp4' : source.url,
      capabilities: source.capabilities,
    };
    const fallbackUrl = LOCAL_MIRRORS.find((url) => url !== source.url);
    if (!fallbackUrl) return [primary];

    // The owned demo provider deliberately returns an ordered mirror so the
    // browser fallback path can be exercised without third-party extraction.
    return [primary, {
      providerId: this.id,
      type: 'mp4' as const,
      url: fallbackUrl,
      capabilities: LOCAL_MIRROR_CAPABILITIES,
    }];
  }

  private mapSeries(id: string): ExternalSeries {
    const series = mockSeriesSeed.find((item) => item.id === id);
    if (!series) throw new ApplicationError('SERIES_NOT_FOUND', 'The demo series was not found.');
    return {
      externalId: externalSeriesId(series.id),
      slug: `demo-${series.slug}`,
      title: `${series.title} (Demo Provider)`,
      alternativeTitle: series.alternativeTitle,
      description: series.description,
      poster: { url: series.posterUrl, usage: 'owned' },
      banner: series.bannerUrl ? { url: series.bannerUrl, usage: 'owned' } : undefined,
      releaseYear: series.releaseYear,
      status: series.status,
      genres: series.genres,
      tags: series.tags || [],
      isAiOriginal: series.isAiOriginal,
      badge: series.badge,
    };
  }

  private allowedHostsFor(url: string) {
    if (url.startsWith('/')) return [];
    return [new URL(url).hostname];
  }
}

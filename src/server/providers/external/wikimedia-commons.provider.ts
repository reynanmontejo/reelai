import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';
import {
  WikimediaCommonsClient,
  type WikimediaCommonsClientLike,
  type WikimediaVideoRecord,
  WIKIMEDIA_AI_VIDEO_TITLES,
} from './wikimedia-commons.client';

export const WIKIMEDIA_COMMONS_PROVIDER_ID = 'wikimedia-commons-ai';
export const WIKIMEDIA_COMMONS_SERIES_ID = 'category:ai-generated-vertical-public-domain';

const EPISODE_TITLES = new Map<string, string>([
  ['File:Cat piano with audio 3EB0CD1F.webm', 'Cat at the Piano'],
  ['File:Dog popcorn with audio 6781BD0C.webm', 'Popcorn Pup'],
  ['File:Victoria-crowned-pigeon.webm', 'Victoria Crowned Pigeon'],
]);

const NATIVE_CAPABILITIES = {
  progressTracking: true,
  seek: true,
  pictureInPicture: true,
  playbackRate: true,
} as const;

function episodeId(video: WikimediaVideoRecord) {
  return `commons-page:${video.pageId}`;
}

function sourceReference(video: WikimediaVideoRecord) {
  return `commons-file:${video.pageId}`;
}

function attribution(video: WikimediaVideoRecord) {
  return `${EPISODE_TITLES.get(video.fileTitle) || video.fileTitle} — ${video.artist} — ${video.license} — Wikimedia Commons`;
}

function orderedVideos(videos: WikimediaVideoRecord[]) {
  const byTitle = new Map(videos.map((video) => [video.fileTitle, video]));
  const ordered = WIKIMEDIA_AI_VIDEO_TITLES.map((title) => byTitle.get(title)).filter((video): video is WikimediaVideoRecord => Boolean(video));
  if (ordered.length !== WIKIMEDIA_AI_VIDEO_TITLES.length) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'One or more curated Wikimedia videos are unavailable.');
  }
  return ordered;
}

function selectWebm(video: WikimediaVideoRecord) {
  const derivative = [...video.derivatives]
    .filter((item) => item.mime.startsWith('video/webm') && item.height <= 1080)
    .sort((a, b) => b.height - a.height)[0];
  return derivative?.url || video.originalUrl;
}

export class WikimediaCommonsAiAdapter implements ExternalProviderAdapter {
  readonly id = WIKIMEDIA_COMMONS_PROVIDER_ID;
  readonly name = 'Wikimedia Commons AI Video';
  readonly allowedHosts = ['commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org'] as const;
  readonly capabilities = {
    catalog: true,
    search: true,
    episodes: true,
    mp4: false,
    webm: true,
    hls: false,
    embed: false,
    watch: true,
    feed: true,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  constructor(private readonly client: WikimediaCommonsClientLike = new WikimediaCommonsClient()) {}

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const videos = orderedVideos(await this.client.getVideos());
    const searchable = ['open ai motion lab', 'ai video', 'experimental', ...videos.flatMap((video) => [
      video.fileTitle,
      EPISODE_TITLES.get(video.fileTitle) || '',
      video.artist,
    ])].join(' ').toLowerCase();
    return searchable.includes(normalized) ? [this.mapSeries(videos)] : [];
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    if (externalId !== WIKIMEDIA_COMMONS_SERIES_ID) {
      throw new ApplicationError('SERIES_NOT_FOUND', 'The Wikimedia Commons collection was not found.');
    }
    return this.mapSeries(orderedVideos(await this.client.getVideos()));
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    if (externalSeriesId !== WIKIMEDIA_COMMONS_SERIES_ID) {
      throw new ApplicationError('SERIES_NOT_FOUND', 'The Wikimedia Commons collection was not found.');
    }
    return orderedVideos(await this.client.getVideos()).map((video, index) => ({
      externalId: episodeId(video),
      episodeNumber: index + 1,
      title: EPISODE_TITLES.get(video.fileTitle) || `AI Video ${index + 1}`,
      description: `A public-domain AI-generated video by ${video.artist}, sourced from Wikimedia Commons.`,
      thumbnail: {
        url: video.thumbnailUrl,
        usage: 'external-authorized',
        attribution: attribution(video),
      },
      durationSeconds: Math.max(1, Math.ceil(video.durationSeconds)),
      releaseDate: video.sourceDate?.slice(0, 10),
      sources: [{
        externalReference: sourceReference(video),
        purpose: 'both',
        priority: 10,
        resolutionMode: 'dynamic',
        type: 'webm',
        capabilities: NATIVE_CAPABILITIES,
        allowedHosts: ['upload.wikimedia.org'],
      }],
    }));
  }

  async resolveStreams(request: ResolveStreamRequest) {
    const videos = orderedVideos(await this.client.getVideos());
    const video = videos.find((item) => episodeId(item) === request.externalEpisodeId);
    if (!video || (request.externalSourceReference && request.externalSourceReference !== sourceReference(video))) {
      throw new ApplicationError('STREAM_NOT_FOUND', 'The Wikimedia Commons video source was not found.');
    }
    return [{
      providerId: this.id,
      type: 'webm' as const,
      url: selectWebm(video),
      capabilities: NATIVE_CAPABILITIES,
    }];
  }

  private mapSeries(videos: WikimediaVideoRecord[]): ExternalSeries {
    const poster = videos[0];
    return {
      externalId: WIKIMEDIA_COMMONS_SERIES_ID,
      slug: 'commons-ai-motion-lab',
      title: 'Open AI Motion Lab',
      alternativeTitle: 'Public-Domain AI Video Experiments',
      description: 'A curated public-domain collection of vertical AI-generated video experiments from Wikimedia Commons.',
      poster: {
        url: poster.thumbnailUrl,
        usage: 'external-authorized',
        attribution: attribution(poster),
      },
      status: 'Experimental collection',
      genres: ['AI', 'Experimental'],
      tags: ['AI-generated', 'Vertical video', 'Public domain', 'Wikimedia Commons'],
      isAiOriginal: true,
      badge: 'OPEN AI VIDEO',
    };
  }
}

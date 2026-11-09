import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import type { ExternalEpisode, ExternalProviderAdapter, ExternalSeries, ResolveStreamRequest } from '@/types/external-provider';
import { YouTubeEmbedClient, type YouTubeEmbedClientLike, type YouTubeVideoMetadata } from './youtube-embed.client';

export const YOUTUBE_EMBED_PROVIDER_ID = 'youtube-embed';
export const YOUTUBE_AI_COLLECTION_ID = 'youtube:curated-ai-shorts-poc';

const CURATED_VIDEOS = [
  {
    videoId: '9oryIMNVtto',
    durationSeconds: 82,
    description: 'An AI-assisted short created by shy kids with OpenAI Sora.',
    aiProvenance: 'Creator-published Sora short',
  },
  {
    videoId: 'DNyxZi9Gp_4',
    durationSeconds: 1_434,
    description: 'The complete edition of Waymark’s AI-generated science-fiction film The Frost.',
    aiProvenance: 'Creator-published AI-generated film',
  },
  {
    videoId: 'sObLB1FWL9w',
    durationSeconds: 32,
    description: 'Runway’s official introduction to its AI Film Festival and the artists using AI filmmaking tools.',
    aiProvenance: 'Official Runway AI Film Festival video',
  },
] as const;

const EMBED_CAPABILITIES = {
  progressTracking: true,
  seek: true,
  pictureInPicture: false,
  playbackRate: true,
} as const;

function externalEpisodeId(videoId: string) {
  return `youtube-video:${videoId}`;
}

function sourceReference(videoId: string) {
  return `youtube-embed:${videoId}`;
}

function embedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0`;
}

export class YouTubeEmbedAdapter implements ExternalProviderAdapter {
  readonly id = YOUTUBE_EMBED_PROVIDER_ID;
  readonly name = 'YouTube authorized embeds';
  readonly allowedHosts = ['www.youtube.com', 'www.youtube-nocookie.com', 'i.ytimg.com'] as const;
  readonly allowedEmbedHosts = ['www.youtube-nocookie.com'] as const;
  readonly capabilities = {
    catalog: true,
    search: true,
    episodes: true,
    mp4: false,
    webm: false,
    hls: false,
    embed: true,
    watch: true,
    feed: true,
    metadataSync: true,
    expiringUrls: false,
  } as const;

  constructor(private readonly client: YouTubeEmbedClientLike = new YouTubeEmbedClient()) {}

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const videos = await this.videos();
    const searchable = ['youtube ai shorts', 'ai film', 'sora', 'runway', ...videos.flatMap((video) => [video.title, video.authorName])].join(' ').toLowerCase();
    return searchable.includes(normalized) ? [this.mapSeries(videos)] : [];
  }

  async getSeries(externalId: string): Promise<ExternalSeries> {
    if (externalId !== YOUTUBE_AI_COLLECTION_ID) throw new ApplicationError('SERIES_NOT_FOUND', 'The YouTube AI collection was not found.');
    return this.mapSeries(await this.videos());
  }

  async getEpisodes(externalSeriesId: string): Promise<ExternalEpisode[]> {
    if (externalSeriesId !== YOUTUBE_AI_COLLECTION_ID) throw new ApplicationError('SERIES_NOT_FOUND', 'The YouTube AI collection was not found.');
    const videos = await this.videos();
    return videos.map((video, index) => ({
      externalId: externalEpisodeId(video.videoId),
      episodeNumber: index + 1,
      title: video.title,
      description: CURATED_VIDEOS[index].description,
      durationSeconds: CURATED_VIDEOS[index].durationSeconds,
      thumbnail: {
        url: video.thumbnailUrl,
        usage: 'external-authorized',
        attribution: `${video.title} — ${video.authorName} — embedded from YouTube. ${CURATED_VIDEOS[index].aiProvenance}.`,
      },
      sources: [{
        externalReference: sourceReference(video.videoId),
        purpose: 'both',
        priority: 10,
        resolutionMode: 'dynamic',
        type: 'embed',
        capabilities: EMBED_CAPABILITIES,
        allowedHosts: ['www.youtube-nocookie.com'],
      }],
    }));
  }

  async resolveStreams(request: ResolveStreamRequest) {
    const match = CURATED_VIDEOS.find((video) => externalEpisodeId(video.videoId) === request.externalEpisodeId);
    if (!match || (request.externalSourceReference && request.externalSourceReference !== sourceReference(match.videoId))) {
      throw new ApplicationError('STREAM_NOT_FOUND', 'The YouTube embed source was not found.');
    }
    return [{
      providerId: this.id,
      type: 'embed' as const,
      url: embedUrl(match.videoId),
      capabilities: EMBED_CAPABILITIES,
    }];
  }

  private videos() {
    return this.client.getVideos(CURATED_VIDEOS.map((video) => video.videoId));
  }

  private mapSeries(videos: YouTubeVideoMetadata[]): ExternalSeries {
    if (videos.length !== CURATED_VIDEOS.length) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'One or more curated YouTube videos are unavailable.');
    return {
      externalId: YOUTUBE_AI_COLLECTION_ID,
      slug: 'youtube-ai-short-film-showcase',
      title: 'AI Short Film Showcase',
      alternativeTitle: 'Curated AI Films',
      description: 'Discover AI-assisted short films and filmmaking showcases from independent creators.',
      poster: {
        url: videos[0].thumbnailUrl,
        usage: 'external-authorized',
        attribution: `${videos[0].title} — ${videos[0].authorName} — YouTube thumbnail.`,
      },
      status: 'AI-assisted film collection',
      genres: ['AI', 'Experimental'],
      tags: ['AI-generated', 'AI-assisted', 'Short film', 'YouTube embed'],
      isAiOriginal: true,
      badge: 'AI FILM SHOWCASE',
    };
  }
}

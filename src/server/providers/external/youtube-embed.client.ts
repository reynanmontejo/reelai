import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const OEMBED_HOST = 'www.youtube.com';
const THUMBNAIL_HOST = 'i.ytimg.com';
const CACHE_TTL_MS = 30 * 60_000;
const MAX_RESPONSE_BYTES = 50_000;

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  authorName: string;
  authorUrl?: string;
  thumbnailUrl: string;
}

export interface YouTubeEmbedClientLike {
  getVideos(videoIds: readonly string[]): Promise<YouTubeVideoMetadata[]>;
}

export function isYouTubeVideoId(value: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function parseYouTubeOEmbed(videoId: string, value: unknown): YouTubeVideoMetadata {
  if (!isYouTubeVideoId(videoId) || !value || typeof value !== 'object') {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned invalid video metadata.');
  }
  const row = value as Record<string, unknown>;
  if (row.provider_name !== 'YouTube'
    || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 300
    || typeof row.author_name !== 'string' || !row.author_name.trim()
    || typeof row.thumbnail_url !== 'string') {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned incomplete video metadata.');
  }

  let thumbnail: URL;
  try {
    thumbnail = new URL(row.thumbnail_url);
  } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned an invalid thumbnail URL.', { cause });
  }
  if (thumbnail.protocol !== 'https:' || thumbnail.hostname !== THUMBNAIL_HOST || !thumbnail.pathname.includes(`/vi/${videoId}/`)) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'YouTube returned a thumbnail outside the approved host.');
  }

  let authorUrl: string | undefined;
  if (typeof row.author_url === 'string') {
    try {
      const parsed = new URL(row.author_url);
      if (parsed.protocol === 'https:' && ['www.youtube.com', 'youtube.com'].includes(parsed.hostname)) authorUrl = parsed.toString();
    } catch {
      // Author attribution remains useful even if an optional author URL is malformed.
    }
  }

  return {
    videoId,
    title: row.title.trim(),
    authorName: row.author_name.trim(),
    authorUrl,
    thumbnailUrl: thumbnail.toString(),
  };
}

export class YouTubeEmbedClient implements YouTubeEmbedClientLike {
  private readonly cache = new Map<string, { expiresAt: number; value: YouTubeVideoMetadata }>();
  private readonly inFlight = new Map<string, Promise<YouTubeVideoMetadata>>();

  async getVideos(videoIds: readonly string[]) {
    return Promise.all(videoIds.map((videoId) => this.getVideo(videoId)));
  }

  private async getVideo(videoId: string): Promise<YouTubeVideoMetadata> {
    if (!isYouTubeVideoId(videoId)) throw new ApplicationError('INVALID_CONTENT_DATA', 'The configured YouTube video ID is invalid.');
    const cached = this.cache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.inFlight.get(videoId);
    if (pending) return pending;
    const request = this.fetchVideo(videoId).finally(() => this.inFlight.delete(videoId));
    this.inFlight.set(videoId, request);
    return request;
  }

  private async fetchVideo(videoId: string) {
    const target = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await safeProviderFetch(`https://${OEMBED_HOST}/oembed?url=${encodeURIComponent(target)}&format=json`, {
      allowedHosts: [OEMBED_HOST],
      timeoutMs: 8_000,
      init: { headers: { Accept: 'application/json', 'User-Agent': 'ReelAI-Development/0.1 (authorized YouTube embed integration)' } },
    });
    if (response.status === 401 || response.status === 403) throw new ApplicationError('SOURCE_FORBIDDEN', 'This YouTube video is not available for embedding.');
    if (response.status === 404) throw new ApplicationError('EPISODE_NOT_FOUND', 'The configured YouTube video was not found.');
    if (response.status === 429) throw new ApplicationError('PROVIDER_RATE_LIMITED', 'YouTube rate limited the metadata request.');
    if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'YouTube metadata is temporarily unavailable.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned an oversized metadata response.');
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned an oversized metadata response.');
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (cause) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'YouTube returned invalid metadata JSON.', { cause });
    }
    const value = parseYouTubeOEmbed(videoId, payload);
    this.cache.set(videoId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }
}

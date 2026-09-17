import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const API_HOST = 'commons.wikimedia.org';
const MAX_RESPONSE_BYTES = 1_000_000;
const CACHE_TTL_MS = 10 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 1_000;

export const WIKIMEDIA_AI_VIDEO_TITLES = [
  'File:Cat piano with audio 3EB0CD1F.webm',
  'File:Dog popcorn with audio 6781BD0C.webm',
  'File:Victoria-crowned-pigeon.webm',
] as const;

type MetadataValue = { value?: unknown };

type WikimediaVideoInfo = {
  url?: unknown;
  descriptionurl?: unknown;
  mime?: unknown;
  width?: unknown;
  height?: unknown;
  size?: unknown;
  duration?: unknown;
  thumburl?: unknown;
  extmetadata?: Record<string, MetadataValue>;
  derivatives?: Array<{
    src?: unknown;
    type?: unknown;
    width?: unknown;
    height?: unknown;
    bandwidth?: unknown;
  }>;
};

export interface WikimediaVideoRecord {
  pageId: number;
  fileTitle: string;
  originalUrl: string;
  descriptionUrl: string;
  thumbnailUrl: string;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
  durationSeconds: number;
  artist: string;
  license: string;
  sourceDate?: string;
  derivatives: Array<{
    url: string;
    mime: string;
    width: number;
    height: number;
    bandwidth: number;
  }>;
}

export interface WikimediaCommonsClientLike {
  getVideos(titles?: readonly string[]): Promise<WikimediaVideoRecord[]>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', `Wikimedia returned an invalid ${field}.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', `Wikimedia returned an invalid ${field}.`);
  }
  return value;
}

function metadataValue(metadata: Record<string, MetadataValue> | undefined, key: string) {
  const value = metadata?.[key]?.value;
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
}

function validatePublicUrl(value: string, hosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned an invalid media URL.', { cause });
  }
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname.toLowerCase())) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'Wikimedia returned a media URL outside the provider allowlist.');
  }
  return url.toString();
}

export function parseWikimediaVideoResponse(payload: unknown): WikimediaVideoRecord[] {
  if (!payload || typeof payload !== 'object') {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned malformed catalog data.');
  }
  const pages = (payload as { query?: { pages?: unknown } }).query?.pages;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned no video pages.');
  }

  return Object.values(pages as Record<string, unknown>).map((pageValue) => {
    if (!pageValue || typeof pageValue !== 'object') {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned a malformed video page.');
    }
    const page = pageValue as { pageid?: unknown; title?: unknown; videoinfo?: unknown };
    if (!Array.isArray(page.videoinfo) || page.videoinfo.length !== 1) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned missing video metadata.');
    }
    const info = page.videoinfo[0] as WikimediaVideoInfo;
    const originalUrl = validatePublicUrl(requiredString(info.url, 'original URL'), ['upload.wikimedia.org']);
    const thumbnailUrl = validatePublicUrl(requiredString(info.thumburl, 'thumbnail URL'), ['thumb.wikimedia.org']);
    const license = metadataValue(info.extmetadata, 'LicenseShortName');
    if (license.toLowerCase() !== 'public domain') {
      throw new ApplicationError('SOURCE_FORBIDDEN', 'The curated Wikimedia item is no longer marked public domain.');
    }

    const derivatives = (Array.isArray(info.derivatives) ? info.derivatives : [])
      .filter((item) => typeof item?.type === 'string' && item.type.startsWith('video/webm'))
      .map((item) => ({
        url: validatePublicUrl(requiredString(item.src, 'derivative URL'), ['upload.wikimedia.org']),
        mime: requiredString(item.type, 'derivative MIME type'),
        width: requiredNumber(item.width, 'derivative width'),
        height: requiredNumber(item.height, 'derivative height'),
        bandwidth: requiredNumber(item.bandwidth, 'derivative bandwidth'),
      }));

    return {
      pageId: requiredNumber(page.pageid, 'page ID'),
      fileTitle: requiredString(page.title, 'file title'),
      originalUrl,
      descriptionUrl: validatePublicUrl(requiredString(info.descriptionurl, 'description URL'), [API_HOST]),
      thumbnailUrl,
      mime: requiredString(info.mime, 'MIME type'),
      width: requiredNumber(info.width, 'width'),
      height: requiredNumber(info.height, 'height'),
      sizeBytes: requiredNumber(info.size, 'file size'),
      durationSeconds: requiredNumber(info.duration, 'duration'),
      artist: metadataValue(info.extmetadata, 'Artist') || 'Wikimedia Commons contributor',
      license,
      sourceDate: metadataValue(info.extmetadata, 'DateTimeOriginal') || undefined,
      derivatives,
    };
  });
}

let requestTail = Promise.resolve();
let nextRequestAt = 0;

async function throttle<T>(task: () => Promise<T>) {
  const previous = requestTail;
  let release: () => void = () => {};
  requestTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const delay = Math.max(0, nextRequestAt - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  try {
    return await task();
  } finally {
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    release();
  }
}

export class WikimediaCommonsClient implements WikimediaCommonsClientLike {
  private readonly cache = new Map<string, { expiresAt: number; value: WikimediaVideoRecord[] }>();
  private readonly inFlight = new Map<string, Promise<WikimediaVideoRecord[]>>();

  async getVideos(titles: readonly string[] = WIKIMEDIA_AI_VIDEO_TITLES) {
    const key = [...titles].sort().join('|');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const request = throttle(async () => {
      const query = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        prop: 'videoinfo',
        viprop: 'url|mime|size|extmetadata|derivatives',
        viurlwidth: '720',
        titles: titles.join('|'),
      });
      const response = await safeProviderFetch(`https://${API_HOST}/w/api.php?${query}`, {
        allowedHosts: [API_HOST],
        timeoutMs: 10_000,
        init: {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ReelAI-Development/0.1 (public Wikimedia metadata integration)',
          },
        },
      });
      if (response.status === 429) throw new ApplicationError('PROVIDER_RATE_LIMITED', 'Wikimedia Commons rate limited the request.');
      if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'Wikimedia Commons is temporarily unavailable.');
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned an unexpected response type.');
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned an oversized metadata response.');
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned an oversized metadata response.');
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Wikimedia returned invalid JSON.', { cause });
      }
      const value = parseWikimediaVideoResponse(payload);
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }).finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);
    return request;
  }
}

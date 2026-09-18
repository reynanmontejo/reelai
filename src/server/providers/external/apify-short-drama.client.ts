import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const APIFY_API_HOST = 'api.apify.com';
const DEFAULT_ACTOR_ID = 'q4Bs4iFsMJwTOV2jH';
const PROVIDER = 'netshort';
const MAX_RESPONSE_BYTES = 2_000_000;
const CACHE_TTL_MS = 15 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 2_000;
const EXTERNAL_ID_PATTERN = /^\d{10,32}$/;
const POSTER_HOSTS = new Set(['awscover.netshort.com', 'static.netshort.com']);

export interface ApifyNetShortSeriesRecord {
  id: string;
  title: string;
  image: string;
  description: string;
  episodeCount?: number;
  tags: string[];
}

export interface ApifyNetShortEpisodeRecord {
  id: string;
  title: string;
  image?: string;
  episodeNumber: number;
  isLocked: boolean;
  isVip: boolean;
}

export interface ApifyShortDramaClientLike {
  getSeries(externalId: string): Promise<ApifyNetShortSeriesRecord>;
  getEpisodes(externalSeriesId: string): Promise<ApifyNetShortEpisodeRecord[]>;
}

type ActorAction = 'detail' | 'episodes';

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', message);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maxLength = 5_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', `Apify returned an invalid ${field}.`);
  }
  return value.trim();
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function validateExternalId(value: unknown, field: string) {
  const id = requiredString(value, field, 32);
  if (!EXTERNAL_ID_PATTERN.test(id)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', `Apify returned an invalid ${field}.`);
  }
  return id;
}

function validatePosterUrl(value: unknown, required: boolean) {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  const raw = requiredString(value, 'NetShort image URL', 2_000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an invalid NetShort image URL.', { cause });
  }
  if (url.protocol !== 'https:' || !POSTER_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'Apify returned a NetShort image outside the metadata allowlist.');
  }
  return url.toString();
}

function actorData(payload: unknown, expectedEndpoint: string) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an unexpected dataset result count.');
  }
  const envelope = objectValue(payload[0], 'Apify returned a malformed dataset item.');
  if (envelope.ok !== true) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The Apify Actor reported a provider failure.');
  const data = objectValue(envelope.data, 'Apify returned no provider data.');
  if (data.resource !== PROVIDER || data.endpoint !== expectedEndpoint || !Array.isArray(data.items)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned data for an unexpected provider endpoint.');
  }
  return data as Record<string, unknown> & { items: unknown[] };
}

function tagsFromExtra(extra: Record<string, unknown>) {
  if (!Array.isArray(extra.tags)) return [];
  return [...new Set(extra.tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 80))].slice(0, 20);
}

export function parseApifyNetShortDetail(payload: unknown, expectedId: string): ApifyNetShortSeriesRecord {
  const data = actorData(payload, 'detail/:id');
  if (data.items.length !== 1) throw new ApplicationError('SERIES_NOT_FOUND', 'The NetShort series was not found.');
  const item = objectValue(data.items[0], 'Apify returned malformed NetShort series metadata.');
  const id = validateExternalId(item.id, 'NetShort series ID');
  if (id !== expectedId) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned the wrong NetShort series.');
  const extra = objectValue(item.extra ?? {}, 'Apify returned malformed NetShort series details.');
  const episodeCount = extra.episodeCount;
  if (episodeCount !== undefined && (!Number.isInteger(episodeCount) || Number(episodeCount) < 0 || Number(episodeCount) > 10_000)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an invalid NetShort episode count.');
  }
  return {
    id,
    title: requiredString(item.title, 'NetShort title', 300),
    image: validatePosterUrl(item.image, true)!,
    description: requiredString(extra.description, 'NetShort description', 10_000),
    episodeCount: episodeCount === undefined ? undefined : Number(episodeCount),
    tags: tagsFromExtra(extra),
  };
}

export function parseApifyNetShortEpisodes(payload: unknown, expectedSeriesId: string): ApifyNetShortEpisodeRecord[] {
  validateExternalId(expectedSeriesId, 'NetShort series ID');
  const data = actorData(payload, 'episodes/:id');
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const episodes = data.items.map((value) => {
    const item = objectValue(value, 'Apify returned malformed NetShort episode metadata.');
    const id = validateExternalId(item.id, 'NetShort episode ID');
    const episodeNumber = item.episodeNumber;
    if (!Number.isInteger(episodeNumber) || Number(episodeNumber) < 1 || Number(episodeNumber) > 10_000) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an invalid NetShort episode number.');
    }
    if (seenIds.has(id) || seenNumbers.has(Number(episodeNumber))) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned duplicate NetShort episode identity.');
    }
    seenIds.add(id);
    seenNumbers.add(Number(episodeNumber));
    const extra = objectValue(item.extra ?? {}, 'Apify returned malformed NetShort episode details.');
    return {
      id,
      title: requiredString(item.title, 'NetShort episode title', 300),
      image: validatePosterUrl(item.image, false),
      episodeNumber: Number(episodeNumber),
      isLocked: optionalBoolean(extra.isLocked),
      isVip: optionalBoolean(extra.isVip),
    };
  }).sort((left, right) => left.episodeNumber - right.episodeNumber);
  if (!episodes.length) throw new ApplicationError('EPISODE_NOT_FOUND', 'The NetShort series has no public episode metadata.');
  return episodes;
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

export class ApifyShortDramaClient implements ApifyShortDramaClientLike {
  private readonly seriesCache = new Map<string, { expiresAt: number; value: ApifyNetShortSeriesRecord }>();
  private readonly episodeCache = new Map<string, { expiresAt: number; value: ApifyNetShortEpisodeRecord[] }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly token = process.env.APIFY_API_TOKEN,
    private readonly actorId = process.env.APIFY_SHORT_DRAMA_ACTOR_ID || DEFAULT_ACTOR_ID,
  ) {}

  async getSeries(externalId: string) {
    validateExternalId(externalId, 'NetShort series ID');
    const cached = this.seriesCache.get(externalId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = parseApifyNetShortDetail(await this.run('detail', externalId), externalId);
    this.seriesCache.set(externalId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async getEpisodes(externalSeriesId: string) {
    validateExternalId(externalSeriesId, 'NetShort series ID');
    const cached = this.episodeCache.get(externalSeriesId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = parseApifyNetShortEpisodes(await this.run('episodes', externalSeriesId), externalSeriesId);
    this.episodeCache.set(externalSeriesId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private async run(action: ActorAction, externalId: string) {
    if (!this.token) {
      throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', 'APIFY_API_TOKEN is required for the Apify metadata provider.');
    }
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(this.actorId)) {
      throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', 'APIFY_SHORT_DRAMA_ACTOR_ID is invalid.');
    }
    const key = `${action}:${externalId}`;
    const current = this.inFlight.get(key);
    if (current) return current;

    const request = throttle(async () => {
      const query = new URLSearchParams({ clean: '1', format: 'json', maxItems: '1', timeout: '30' });
      const response = await safeProviderFetch(
        `https://${APIFY_API_HOST}/v2/actors/${encodeURIComponent(this.actorId)}/run-sync-get-dataset-items?${query}`,
        {
          allowedHosts: [APIFY_API_HOST],
          timeoutMs: 45_000,
          init: {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'ReelAI-Development/0.1 (Apify metadata integration)',
            },
            body: JSON.stringify({ provider: PROVIDER, action, id: externalId, language: 'en', limit: 1, maxPages: 1 }),
          },
        },
      );
      if (response.status === 401 || response.status === 403) {
        throw new ApplicationError('PROVIDER_UNAVAILABLE', 'Apify rejected the configured server credential.');
      }
      if (response.status === 402 || response.status === 429) {
        throw new ApplicationError('PROVIDER_RATE_LIMITED', 'Apify usage limits prevent this metadata request.');
      }
      if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The Apify metadata provider is temporarily unavailable.');
      if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an unexpected response type.');
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an oversized metadata response.');
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned an oversized metadata response.');
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'Apify returned invalid JSON.', { cause });
      }
      return payload;
    }).finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);
    return request;
  }
}

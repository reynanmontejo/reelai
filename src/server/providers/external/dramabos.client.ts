import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const API_HOST = 'dramabos.live';
const CDN_HOST = 'cdn.dramabos.live';
const MAX_RESPONSE_BYTES = 2_000_000;
const EXTERNAL_ID_PATTERN = /^([a-z0-9-]{2,32}):([A-Za-z0-9_-]{1,160})$/;

// Providers documented with the standard /{provider}/api/v1 route shape.
const STANDARD_PROVIDERS = new Set([
  'starshort', 'dramabite', 'freereels', 'fundrama', 'microdrama', 'vigloo',
  'dramabox', 'dramawave', 'netshort', 'shortmax', 'goodshort', 'melolo',
  'velolo', 'reelshort', 'stardusttv', 'serialplus', 'dotdrama', 'rapidtv',
  'shortswave', 'dramanova', 'cubetv', 'reelbuzz', 'flareflow', 'moboreels',
  'happyshort', 'reelife', 'pinedrama', 'flextv', 'reelala', 'anyreel',
  'raptdrama', 'bonustv', 'minitv', 'golddrama', 'joyreels', 'kalostv',
  'vibeshort', 'bilitv', 'iqiyi', 'bstation',
]);

export interface DramaBosSeriesRecord {
  externalId: string;
  provider: string;
  providerSeriesId: string;
  title: string;
  cover: string;
  description?: string;
  episodeCount?: number;
  genres: string[];
  language?: string;
  rating?: number;
}

export interface DramaBosEpisodeRecord {
  externalId: string;
  episodeNumber: number;
  title: string;
  thumbnail?: string;
  durationSeconds?: number;
  locked: boolean;
}

export interface DramaBosClientLike {
  search(query: string): Promise<DramaBosSeriesRecord[]>;
  getSeries(externalId: string): Promise<DramaBosSeriesRecord>;
  getEpisodes(externalSeriesId: string): Promise<DramaBosEpisodeRecord[]>;
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', message);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maxLength = 5_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', `DramaBos returned an invalid ${field}.`);
  }
  return value.trim();
}

function optionalString(value: unknown, maxLength = 10_000) {
  return typeof value === 'string' && value.trim() && value.length <= maxLength ? value.trim() : undefined;
}

function optionalPositiveInteger(value: unknown, maximum = 10_000) {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum ? Number(value) : undefined;
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validateCdnUrl(value: unknown, required: boolean) {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  const raw = requiredString(value, 'image URL', 2_000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an invalid image URL.', { cause });
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== CDN_HOST) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'DramaBos returned an image outside its documented CDN.');
  }
  return url.toString();
}

function genresFrom(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 80))].slice(0, 20);
}

export function parseDramaBosExternalId(value: string) {
  const match = EXTERNAL_ID_PATTERN.exec(value);
  if (!match || !STANDARD_PROVIDERS.has(match[1])) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos requires an external ID formatted as provider:series-id.');
  }
  return { provider: match[1], providerSeriesId: match[2] };
}

function normalizeSeries(value: unknown, fallbackProvider?: string): DramaBosSeriesRecord {
  const record = objectValue(value, 'DramaBos returned malformed series metadata.');
  const provider = requiredString(record.source ?? fallbackProvider, 'provider', 32).toLowerCase();
  if (!STANDARD_PROVIDERS.has(provider)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an unsupported provider.');
  }
  const providerSeriesId = requiredString(record.id ?? record.code, 'series ID', 160);
  if (!/^[A-Za-z0-9_-]+$/.test(providerSeriesId)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an invalid series ID.');
  }
  return {
    externalId: `${provider}:${providerSeriesId}`,
    provider,
    providerSeriesId,
    title: requiredString(record.title, 'series title', 300),
    cover: validateCdnUrl(record.cover, true)!,
    description: optionalString(record.desc ?? record.description),
    episodeCount: optionalPositiveInteger(record.episodes ?? record.totalEpisodes),
    genres: genresFrom(record.genre ?? record.genres),
    language: optionalString(record.language, 40),
    rating: optionalFiniteNumber(record.rating),
  };
}

export function parseDramaBosSearchResponse(payload: unknown, fallbackProvider: string) {
  const rows = Array.isArray(payload)
    ? payload
    : objectValue(payload, 'DramaBos returned malformed search results.').results;
  if (!Array.isArray(rows)) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned malformed search results.');
  }
  return rows.map((value) => normalizeSeries(value, fallbackProvider));
}

export function parseDramaBosSeriesResponse(payload: unknown, expectedExternalId: string) {
  const expected = parseDramaBosExternalId(expectedExternalId);
  const envelope = objectValue(payload, 'DramaBos returned malformed series metadata.');
  const value = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
  const record = normalizeSeries(value, expected.provider);
  if (record.externalId !== expectedExternalId) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned the wrong series.');
  }
  return record;
}

export function parseDramaBosEpisodeResponse(payload: unknown, expectedExternalId: string) {
  const expected = parseDramaBosExternalId(expectedExternalId);
  const envelope = objectValue(payload, 'DramaBos returned malformed episode metadata.');
  const data = envelope.data && typeof envelope.data === 'object' ? objectValue(envelope.data, 'DramaBos returned malformed episode metadata.') : envelope;
  const rows = data.episodes;
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApplicationError('EPISODE_NOT_FOUND', 'DramaBos returned no episodes for this series.');
  }
  const seen = new Set<number>();
  return rows.map((value) => {
    const record = objectValue(value, 'DramaBos returned malformed episode metadata.');
    const episodeNumber = optionalPositiveInteger(record.number ?? record.episode, 100_000);
    if (!episodeNumber || seen.has(episodeNumber)) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned invalid or duplicate episode numbering.');
    }
    seen.add(episodeNumber);
    const durationSeconds = record.duration === undefined ? undefined : optionalPositiveInteger(record.duration, 86_400);
    if (record.duration !== undefined && durationSeconds === undefined) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an invalid episode duration.');
    }
    return {
      externalId: `${expected.provider}:${expected.providerSeriesId}:episode:${episodeNumber}`,
      episodeNumber,
      title: optionalString(record.title, 300) || `Episode ${episodeNumber}`,
      thumbnail: validateCdnUrl(record.thumbnail, false),
      durationSeconds,
      locked: record.locked === true,
    } satisfies DramaBosEpisodeRecord;
  }).sort((left, right) => left.episodeNumber - right.episodeNumber);
}

export class DramaBosClient implements DramaBosClientLike {
  constructor(
    private readonly apiKey = process.env.DRAMABOS_API_KEY,
    private readonly searchProvider = process.env.DRAMABOS_SEARCH_PROVIDER || 'dramabox',
  ) {}

  async search(query: string) {
    const normalized = query.trim();
    if (!normalized || normalized.length > 200) return [];
    if (!STANDARD_PROVIDERS.has(this.searchProvider)) {
      throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', 'DRAMABOS_SEARCH_PROVIDER is unsupported.');
    }
    const parameter = this.searchProvider === 'dramabox' ? 'keyword' : 'q';
    const search = new URLSearchParams({ [parameter]: normalized, page: '1' });
    return parseDramaBosSearchResponse(
      await this.request(`/${this.searchProvider}/api/v1/search?${search}`),
      this.searchProvider,
    );
  }

  async getSeries(externalId: string) {
    const { provider, providerSeriesId } = parseDramaBosExternalId(externalId);
    return parseDramaBosSeriesResponse(
      await this.request(`/${provider}/api/v1/detail/${encodeURIComponent(providerSeriesId)}`),
      externalId,
    );
  }

  async getEpisodes(externalSeriesId: string) {
    const { provider, providerSeriesId } = parseDramaBosExternalId(externalSeriesId);
    return parseDramaBosEpisodeResponse(
      await this.request(`/${provider}/api/v1/episodes/${encodeURIComponent(providerSeriesId)}`),
      externalSeriesId,
    );
  }

  private async request(path: string) {
    if (!this.apiKey) {
      throw new ApplicationError('INVALID_BACKEND_CONFIGURATION', 'DRAMABOS_API_KEY is required for the DramaBos metadata provider.');
    }
    const response = await safeProviderFetch(`https://${API_HOST}${path}`, {
      allowedHosts: [API_HOST],
      timeoutMs: 10_000,
      init: {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'ReelAI-Development/0.1 (DramaBos metadata integration)',
        },
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new ApplicationError('PROVIDER_UNAVAILABLE', 'DramaBos rejected the configured server credential.');
    }
    if (response.status === 429) {
      throw new ApplicationError('PROVIDER_RATE_LIMITED', 'The DramaBos request quota was reached.');
    }
    if (response.status === 404) throw new ApplicationError('SERIES_NOT_FOUND', 'The DramaBos record was not found.');
    if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'DramaBos is temporarily unavailable.');
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an unexpected response type.');
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an oversized response.');
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned an oversized response.');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaBos returned invalid JSON.', { cause });
    }
  }
}

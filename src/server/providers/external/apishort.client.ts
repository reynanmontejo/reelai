import 'server-only';

import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch, validatePlaybackUrl } from '@/server/security/url-policy';

const HOST = 'apishort.com';
const POSTER_HOSTS = ['akamai-static.shorttv.live'];
const MAX_BYTES = 2_000_000;
const TTL_MS = 15 * 60_000;

export interface ApiShortTitle {
  externalId: string;
  title: string;
  description: string;
  posterUrl: string;
  genres: string[];
  tags?: string[];
  reportedEpisodeCount?: number;
}

export interface ApiShortClientLike {
  getCatalog(): Promise<ApiShortTitle[]>;
  getSeries(externalId: string): Promise<ApiShortTitle>;
  getEpisodes(externalId: string): Promise<ApiShortEpisode[]>;
  getPlayback(externalEpisodeId: string): Promise<ApiShortPlayback[]>;
}

export interface ApiShortPlayback {
  url: string;
  expiresAt: string;
}

export function parseApiShortPlayback(payload: unknown, externalEpisodeId: string, now = Date.now()): ApiShortPlayback[] {
  const match = /^(shortmax:\d{1,20}):episode:(\d{1,20})$/.exec(externalEpisodeId);
  if (!match) throw new ApplicationError('INVALID_CONTENT_DATA', 'The APIShort episode reference is invalid.');
  const data = seriesData(payload, match[1]);
  // Validate identity and numbering before selecting any playback data.
  parseApiShortEpisodes(payload, match[1]);
  const episode = (data.episodes as Record<string, unknown>[]).find((row) => String(row.id) === match[2]);
  if (!episode) throw new ApplicationError('EPISODE_NOT_FOUND', 'APIShort returned no matching episode.');
  if (!episode.video || typeof episode.video !== 'object' || Array.isArray(episode.video)) malformed();
  const expires = episode.expires ?? data.expires;
  if (typeof expires !== 'number' || !Number.isSafeInteger(expires)) malformed();
  const expiresAtMs = expires * 1_000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now + 60_000) {
    throw new ApplicationError('SOURCE_EXPIRED', 'APIShort returned expired playback links.');
  }
  const video = episode.video as Record<string, unknown>;
  const urls = ['video_1080', 'video_720', 'video_480'].flatMap((quality) => {
    const raw = video[quality];
    if (raw === undefined || raw === null || raw === '') return [];
    if (typeof raw !== 'string' || raw.length > 8_000) malformed();
    const url = validatePlaybackUrl(raw, { allowedHosts: POSTER_HOSTS });
    if (!new URL(url).pathname.endsWith('.m3u8')) malformed();
    return [url];
  });
  if (!urls.length) throw new ApplicationError('STREAM_NOT_FOUND', 'APIShort returned no HLS rendition.');
  return [...new Set(urls)].map((url) => ({ url, expiresAt: new Date(expiresAtMs).toISOString() }));
}

export interface ApiShortEpisode {
  externalId: string;
  episodeNumber: number;
  durationSeconds?: number;
}

export function parseApiShortPlayableEpisodes(payload: unknown, externalId: string): ApiShortEpisode[] {
  const episodes = parseApiShortEpisodes(payload, externalId);
  if (!episodes.length || episodes[0].episodeNumber !== 1) {
    throw new ApplicationError('STREAM_NOT_FOUND', 'APIShort returned no playable first episode.');
  }
  // The import publishes a source definition only when every supplied episode
  // has a valid, unexpired HLS rendition. Temporary URLs never leave this check.
  for (const episode of episodes) parseApiShortPlayback(payload, episode.externalId);
  return episodes;
}

function seriesCode(externalId: string) {
  const match = /^shortmax:(\d{1,20})$/.exec(externalId);
  if (!match) throw new ApplicationError('INVALID_CONTENT_DATA', 'APIShort IDs must use shortmax:<code>.');
  return match[1];
}

function seriesData(payload: unknown, externalId: string): Record<string, unknown> {
  seriesCode(externalId);
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) malformed();
  const data = payload.data as Record<string, unknown>;
  if (`shortmax:${data.code}` !== externalId) malformed();
  return data;
}

export function parseApiShortDetail(payload: unknown, externalId: string): ApiShortTitle {
  return parseApiShortCatalog({ data: [seriesData(payload, externalId)] })[0];
}

export function parseApiShortEpisodes(payload: unknown, externalId: string): ApiShortEpisode[] {
  const data = seriesData(payload, externalId);
  if (!Array.isArray(data.episodes) || data.episodes.length > 10_000 || !Number.isInteger(data.totalEpisodes) || data.totalEpisodes !== data.episodes.length) malformed();
  const ids = new Set<string>();
  const numbers = new Set<number>();
  return data.episodes.map((value: unknown) => {
    if (!value || typeof value !== 'object') malformed();
    const row = value as Record<string, unknown>;
    const id = typeof row.id === 'number' && Number.isSafeInteger(row.id) ? String(row.id) : row.id;
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id) || ids.has(id)) malformed();
    const number = row.episode;
    if (!Number.isInteger(number) || Number(number) < 1 || Number(number) > 10_000 || numbers.has(Number(number))) malformed();
    if (row.duration !== undefined && (typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration <= 0 || row.duration > 86_400)) malformed();
    ids.add(id);
    numbers.add(Number(number));
    // Explicit projection: discard video, cover and temporary expiry fields.
    return { externalId: `${externalId}:episode:${id}`, episodeNumber: Number(number), durationSeconds: row.duration as number | undefined };
  }).sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function malformed(): never {
  throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'APIShort returned unexpected ShortMax catalog data.');
}

export function parseApiShortCatalog(payload: unknown): ApiShortTitle[] {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) malformed();
  if (payload.data.length > 1_000) malformed();
  const titles = payload.data.map((row: unknown) => {
    if (!row || typeof row !== 'object') malformed();
    const record = row as Record<string, unknown>;
    // ShortMax detail routes use code, not the separate numeric id.
    const code = typeof record.code === 'number' && Number.isSafeInteger(record.code) ? String(record.code) : record.code;
    if (typeof code !== 'string' || !/^\d{1,20}$/.test(code)) malformed();
    if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 300) malformed();
    if (typeof record.cover !== 'string' || record.cover.length > 4_000) malformed();
    const posterUrl = validatePlaybackUrl(record.cover, { allowedHosts: POSTER_HOSTS });
    if (record.summary !== undefined && (typeof record.summary !== 'string' || record.summary.length > 10_000)) malformed();
    if (record.episodes !== undefined && (!Number.isInteger(record.episodes) || Number(record.episodes) < 0 || Number(record.episodes) > 10_000)) malformed();
    const tags = Array.isArray(record.tags) ? record.tags : [];
    const labels = [...new Set(tags.flatMap((tag: unknown) => {
      const label = typeof tag === 'string' ? tag
        : tag && typeof tag === 'object' && 'labelName' in tag ? tag.labelName : undefined;
      return typeof label === 'string' && label.trim() && label.length <= 80 ? [label.trim()] : [];
    }))].slice(0, 20);
    return {
      externalId: `shortmax:${code}`,
      title: record.name.trim(),
      description: typeof record.summary === 'string' ? record.summary.trim() : '',
      posterUrl,
      genres: labels.filter(label => !/^(?:top trending|most searched)\s+top\.\d+$/i.test(label)),
      tags: labels.filter(label => /^(?:top trending|most searched)\s+top\.\d+$/i.test(label)),
      reportedEpisodeCount: record.episodes === undefined ? undefined : Number(record.episodes),
    };
  });
  // The live popular response repeats titles across ranking sections.
  // Preserve the first ranked occurrence while validating every supplied row.
  const unique = new Map<string, ApiShortTitle>();
  for (const title of titles) {
    if (!unique.has(title.externalId)) unique.set(title.externalId, title);
  }
  return [...unique.values()];
}

export class ApiShortClient implements ApiShortClientLike {
  private cached?: { expiresAt: number; titles: ApiShortTitle[] };
  private inFlight?: Promise<ApiShortTitle[]>;
  private readonly metadataCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly metadataRequests = new Map<string, Promise<unknown>>();
  private readonly playbackCache = new Map<string, { expiresAt: number; payload: unknown }>();
  private readonly playbackRequests = new Map<string, Promise<unknown>>();

  constructor(private readonly apiKey = process.env.APISHORT_API_KEY) {}

  async getCatalogPage(page: number): Promise<ApiShortTitle[]> {
    if (!Number.isInteger(page) || page < 1 || page > 50) throw new ApplicationError('INVALID_CONTENT_DATA', 'Invalid APIShort catalog page.');
    return parseApiShortCatalog(await this.request(`popular?lang=en&page=${page}`));
  }

  async getImportEpisodes(externalId: string): Promise<ApiShortEpisode[]> {
    return parseApiShortPlayableEpisodes(await this.request(`alleps/${seriesCode(externalId)}?lang=en`), externalId);
  }

  async getCatalog(): Promise<ApiShortTitle[]> {
    if (this.cached && this.cached.expiresAt > Date.now()) return structuredClone(this.cached.titles);
    if (this.inFlight) return structuredClone(await this.inFlight);
    this.inFlight = this.request('popular?lang=en&page=1').then(parseApiShortCatalog);
    try {
      const titles = await this.inFlight;
      this.cached = { titles, expiresAt: Date.now() + TTL_MS };
      return structuredClone(titles);
    } finally {
      this.inFlight = undefined;
    }
  }

  getSeries(externalId: string): Promise<ApiShortTitle> {
    const code = seriesCode(externalId);
    return this.metadata(`detail/${code}?lang=en`, (payload) => parseApiShortDetail(payload, externalId));
  }

  getEpisodes(externalId: string): Promise<ApiShortEpisode[]> {
    const code = seriesCode(externalId);
    return this.metadata(`alleps/${code}?lang=en`, (payload) => parseApiShortEpisodes(payload, externalId));
  }

  async getPlayback(externalEpisodeId: string): Promise<ApiShortPlayback[]> {
    const match = /^(shortmax:\d{1,20}):episode:\d{1,20}$/.exec(externalEpisodeId);
    if (!match) throw new ApplicationError('INVALID_CONTENT_DATA', 'The APIShort episode reference is invalid.');
    const externalSeriesId = match[1];
    const cached = this.playbackCache.get(externalSeriesId);
    if (cached && cached.expiresAt > Date.now()) return parseApiShortPlayback(cached.payload, externalEpisodeId);
    let request = this.playbackRequests.get(externalSeriesId);
    if (!request) {
      request = this.request(`alleps/${seriesCode(externalSeriesId)}?lang=en`).finally(() => this.playbackRequests.delete(externalSeriesId));
      this.playbackRequests.set(externalSeriesId, request);
    }
    const payload = await request;
    const candidates = parseApiShortPlayback(payload, externalEpisodeId);
    if (this.playbackCache.size >= 8) this.playbackCache.delete(this.playbackCache.keys().next().value!);
    this.playbackCache.set(externalSeriesId, {
      payload,
      expiresAt: Math.min(Date.now() + 5 * 60_000, Date.parse(candidates[0].expiresAt) - 60_000),
    });
    return candidates;
  }

  private async metadata<T>(path: string, parse: (payload: unknown) => T): Promise<T> {
    const cached = this.metadataCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value as T);
    let request = this.metadataRequests.get(path);
    if (!request) {
      request = this.request(path).then(parse).then((value) => {
        if (this.metadataCache.size >= 32) this.metadataCache.delete(this.metadataCache.keys().next().value!);
        this.metadataCache.set(path, { value, expiresAt: Date.now() + TTL_MS });
        return value;
      }).finally(() => this.metadataRequests.delete(path));
      this.metadataRequests.set(path, request);
    }
    return structuredClone(await request as T);
  }

  private async request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await safeProviderFetch(`https://${HOST}/v1/shortmax/api/v1/${path}`, {
        allowedHosts: [HOST],
        maxRedirects: 0,
        timeoutMs: 15_000,
        init: {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ReelAI-Development/0.1 (ShortMax catalog metadata test)',
            ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
          },
        },
      });
    } catch {
      throw new ApplicationError('PROVIDER_UNAVAILABLE', 'APIShort could not be reached. Try again later.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApplicationError('SOURCE_FORBIDDEN', 'APIShort requires a valid free API key. Configure APISHORT_API_KEY on the server.');
    }
    if (response.status === 429) throw new ApplicationError('PROVIDER_RATE_LIMITED', 'APIShort daily request allowance has been reached.');
    if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'APIShort catalog is temporarily unavailable.');
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) malformed();
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) malformed();
    // Enforce the limit while streaming, including responses without Content-Length.
    const reader = response.body?.getReader();
    if (!reader) malformed();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); malformed(); }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('PROVIDER_UNAVAILABLE', 'APIShort response could not be read.');
    } finally {
      reader.releaseLock();
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { malformed(); }
    return payload;
  }
}

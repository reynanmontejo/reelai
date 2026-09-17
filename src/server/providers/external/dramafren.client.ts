import 'server-only';

import * as cheerio from 'cheerio';
import { ApplicationError } from '@/lib/application-error';
import { safeProviderFetch } from '@/server/security/url-policy';

const SITE_HOST = 'dramafren.org';
const MAX_HTML_BYTES = 750_000;
const CACHE_TTL_MS = 5 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 1_000;

export const DRAMAFREN_ALLOWED_EMBED_HOSTS = ['dramafrenvip.upns.pro'] as const;

export interface DramaFrenSeriesRecord {
  slug: string;
  title: string;
  description: string;
  posterUrl: string;
  status?: string;
  watchUrl: string;
}

export interface DramaFrenWatchRecord {
  slug: string;
  iframeUrl: string;
}

export interface DramaFrenClientLike {
  getSeries(slug: string): Promise<DramaFrenSeriesRecord>;
  getWatch(slug: string): Promise<DramaFrenWatchRecord>;
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function validateUrl(value: string, allowedHosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaFren returned an invalid URL.', { cause });
  }
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'DramaFren returned a URL outside the provider allowlist.');
  }
  return url.toString();
}

export function parseDramaFrenSeries(html: string, slug: string): DramaFrenSeriesRecord {
  const $ = cheerio.load(html);
  const rawTitle = clean($('meta[property="og:title"]').attr('content') || $('h1').first().text());
  const title = rawTitle.replace(/\s+Chinese Drama\s*-\s*DramaFren$/i, '').replace(/\s*-\s*DramaFren$/i, '');
  const posterUrl = $('meta[property="og:image"]').attr('content') || $('.poster img, img.wp-post-image').first().attr('src') || '';
  const description = clean($('meta[name="description"]').attr('content') || '');
  const statusItem = $('li').filter((_index, element) => clean($(element).text()).toLowerCase().startsWith('status:')).first();
  const status = clean(statusItem.find('.colspan, span').last().text() || statusItem.text().replace(/^status:/i, '')) || undefined;
  const watchHref = $(`a[href*="/watch/${slug}"]`).first().attr('href') || `https://${SITE_HOST}/watch/${slug}/`;

  if (!title || !posterUrl) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaFren series-page selectors no longer match the public page.');
  }
  return {
    slug,
    title,
    description: description || `A short-drama title from the authorized DramaFren catalog.`,
    posterUrl: validateUrl(posterUrl, [SITE_HOST]),
    status,
    watchUrl: validateUrl(new URL(watchHref, `https://${SITE_HOST}`).toString(), [SITE_HOST]),
  };
}

export function parseDramaFrenWatch(html: string, slug: string): DramaFrenWatchRecord {
  const $ = cheerio.load(html);
  const iframeSource = $('iframe[src]').map((_index, element) => $(element).attr('src') || '').get()
    .find((value) => {
      try { return DRAMAFREN_ALLOWED_EMBED_HOSTS.includes(new URL(value).hostname as typeof DRAMAFREN_ALLOWED_EMBED_HOSTS[number]); }
      catch { return false; }
    });
  if (!iframeSource) {
    throw new ApplicationError('STREAM_NOT_FOUND', 'No authorized DramaFren embed is currently available for this title.');
  }
  return { slug, iframeUrl: validateUrl(iframeSource, DRAMAFREN_ALLOWED_EMBED_HOSTS) };
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
  try { return await task(); }
  finally { nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS; release(); }
}

export class DramaFrenClient implements DramaFrenClientLike {
  private readonly cache = new Map<string, { expiresAt: number; value: string }>();
  private readonly inFlight = new Map<string, Promise<string>>();

  async getSeries(slug: string) {
    return parseDramaFrenSeries(await this.fetchPage(`https://${SITE_HOST}/series/${encodeURIComponent(slug)}/`), slug);
  }

  async getWatch(slug: string) {
    return parseDramaFrenWatch(await this.fetchPage(`https://${SITE_HOST}/watch/${encodeURIComponent(slug)}/`), slug);
  }

  private async fetchPage(url: string) {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const current = this.inFlight.get(url);
    if (current) return current;

    const request = throttle(async () => {
      const response = await safeProviderFetch(url, {
        allowedHosts: [SITE_HOST], timeoutMs: 10_000,
        init: { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'ReelAI-Authorized-Integration/0.1' } },
      });
      if (response.status === 429) throw new ApplicationError('PROVIDER_RATE_LIMITED', 'DramaFren rate limited the metadata request.');
      if (response.status === 404) throw new ApplicationError('SERIES_NOT_FOUND', 'The DramaFren title was not found.');
      if (!response.ok) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'DramaFren is temporarily unavailable.');
      if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
        throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaFren returned an unexpected response type.');
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_HTML_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaFren returned an oversized page.');
      const html = await response.text();
      if (html.length > MAX_HTML_BYTES) throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'DramaFren returned an oversized page.');
      this.cache.set(url, { value: html, expiresAt: Date.now() + CACHE_TTL_MS });
      return html;
    }).finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, request);
    return request;
  }
}

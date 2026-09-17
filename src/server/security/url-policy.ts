import 'server-only';

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { ApplicationError } from '@/lib/application-error';

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 0;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : false;
}

export function validatePlaybackUrl(
  value: string,
  options: { allowedHosts: readonly string[]; allowedEmbedHosts?: readonly string[]; allowRelativeUrls?: boolean; isEmbed?: boolean },
) {
  if (value.startsWith('/')) {
    if (!options.allowRelativeUrls || value.startsWith('//') || value.includes('\\')) {
      throw new ApplicationError('SOURCE_FORBIDDEN', 'The provider returned a disallowed playback URL.');
    }
    return value;
  }

  let url: URL;
  try { url = new URL(value); } catch (cause) {
    throw new ApplicationError('MALFORMED_PROVIDER_RESPONSE', 'The provider returned an invalid playback URL.', { cause });
  }
  if (url.protocol !== 'https:') throw new ApplicationError('SOURCE_FORBIDDEN', 'Only HTTPS provider URLs are allowed.');
  if (url.username || url.password) throw new ApplicationError('SOURCE_FORBIDDEN', 'Credentials are not allowed in playback URLs.');
  const hostname = url.hostname.toLowerCase();
  if (blockedHostnames.has(hostname) || isPrivateAddress(hostname)) throw new ApplicationError('SOURCE_FORBIDDEN', 'Private network playback targets are forbidden.');
  const allowlist = options.isEmbed ? options.allowedEmbedHosts || [] : options.allowedHosts;
  if (!allowlist.map((host) => host.toLowerCase()).includes(hostname)) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'The provider returned a URL outside its allowlist.', { context: { hostname } });
  }
  return url.toString();
}

async function validateResolvedAddress(url: URL) {
  const records = await lookup(url.hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new ApplicationError('SOURCE_FORBIDDEN', 'The provider hostname resolves to a forbidden network target.');
  }
}

export async function safeProviderFetch(
  input: string,
  options: { allowedHosts: readonly string[]; timeoutMs?: number; init?: RequestInit; maxRedirects?: number },
) {
  let current = new URL(validatePlaybackUrl(input, { allowedHosts: options.allowedHosts }));
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    await validateResolvedAddress(current);
    const response = await fetch(current, {
      ...options.init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirect === maxRedirects) throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The provider returned an invalid redirect.');
    current = new URL(validatePlaybackUrl(new URL(location, current).toString(), { allowedHosts: options.allowedHosts }));
  }
  throw new ApplicationError('PROVIDER_UNAVAILABLE', 'The provider exceeded the redirect limit.');
}

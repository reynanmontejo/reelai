import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from '@/server/security/rate-limiter';
import { isPrivateAddress, validatePlaybackUrl } from '@/server/security/url-policy';

describe('provider URL policy', () => {
  it('accepts exact authorized HTTPS hosts and explicitly permitted owned paths', () => {
    expect(validatePlaybackUrl('https://media.example.test/video.m3u8', { allowedHosts: ['media.example.test'] })).toBe('https://media.example.test/video.m3u8');
    expect(validatePlaybackUrl('/videos/reel-1.mp4', { allowedHosts: [], allowRelativeUrls: true })).toBe('/videos/reel-1.mp4');
  });

  it('rejects arbitrary hosts, unsafe protocols, credentials, and private targets', () => {
    expect(() => validatePlaybackUrl('https://evil.example/video.mp4', { allowedHosts: ['media.example.test'] })).toThrow(/allowlist/);
    expect(() => validatePlaybackUrl('http://media.example.test/video.mp4', { allowedHosts: ['media.example.test'] })).toThrow(/HTTPS/);
    expect(() => validatePlaybackUrl('https://user:secret@media.example.test/video.mp4', { allowedHosts: ['media.example.test'] })).toThrow(/Credentials/);
    expect(() => validatePlaybackUrl('https://127.0.0.1/video.mp4', { allowedHosts: ['127.0.0.1'] })).toThrow(/Private network/);
    expect(() => validatePlaybackUrl('file:///etc/passwd', { allowedHosts: [] })).toThrow(/HTTPS/);
  });

  it('recognizes common IPv4 and IPv6 private ranges', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});

describe('MVP rate limiter', () => {
  it('enforces a fixed window and reports retry timing', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.consume('guest', 0).allowed).toBe(true);
    expect(limiter.consume('guest', 1).allowed).toBe(true);
    expect(limiter.consume('guest', 2)).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(limiter.consume('guest', 1_001).allowed).toBe(true);
  });
});

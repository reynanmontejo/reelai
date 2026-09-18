import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '@/lib/security-policy';

describe('content security policy', () => {
  it('allows only the default authorized embed host when external adapters are disabled', () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("frame-src 'self' https://www.youtube-nocookie.com;");
    expect(policy).not.toContain('dramafrenvip.upns.pro');
  });

  it('allows the DramaFren embed host only when its adapter is explicitly enabled', () => {
    const policy = contentSecurityPolicy('wikimedia-commons-ai, dramafren-authorized');
    expect(policy).toContain('https://dramafrenvip.upns.pro');
  });
});

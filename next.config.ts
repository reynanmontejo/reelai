import type { NextConfig } from 'next';
import { contentSecurityPolicy } from './src/lib/security-policy';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy(process.env.REELAI_EXTERNAL_PROVIDERS) },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

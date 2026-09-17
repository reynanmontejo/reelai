import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-src 'self' https://www.youtube-nocookie.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'" },
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

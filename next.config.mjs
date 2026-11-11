import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['@electric-sql/pglite', 'pg', '@paypal/agent-toolkit'],
  devIndicators: false,
  poweredByHeader: false,
  // Basic security headers. Same-site framing only, no MIME sniffing, HTTPS only, minimal referrer (help links carry a token).
  async headers() {
    return [{ source: '/:path*', headers: [
      // The demo stage frames the app's own pages. Nobody else's site may frame them.
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), '@': here };
    return config;
  },
};

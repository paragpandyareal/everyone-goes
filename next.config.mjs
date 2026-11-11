import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['@electric-sql/pglite', 'pg', '@paypal/agent-toolkit'],
  devIndicators: false,
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), '@': here };
    return config;
  },
};

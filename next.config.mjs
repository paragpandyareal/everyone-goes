/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['@electric-sql/pglite', 'pg', '@paypal/agent-toolkit'],
  devIndicators: false,
};

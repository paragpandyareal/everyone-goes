// PRD 7.1. The family <-> cover join exists only as AES-256-GCM sealed references, opened inside the server code that performs a cover.
import crypto from 'node:crypto';

const key = () => {
  if (!process.env.LINK_TABLE_KEY && process.env.NODE_ENV === 'production' && process.env.VITEST !== 'true') throw new Error('LINK_TABLE_KEY must be set in production');
  return crypto.createHash('sha256').update(process.env.LINK_TABLE_KEY || 'dev-only-link-table-key-change-me').digest();
};

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function unseal(sealed: string): string {
  const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

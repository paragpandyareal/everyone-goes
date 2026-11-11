// PRD 8. The coordinator's click mints a single use HMAC signed approval bound to the request, amount and pledge, valid 5 minutes.
// The money path refuses to run without one. The AI has no way to mint it.
import crypto from 'node:crypto';
import { sql, one, newId } from './db';

const secret = () => process.env.APPROVAL_SIGNING_KEY || 'dev-only-approval-key-change-me';
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export type ApprovalClaims = { requestId: string; amountCents: number; pledgeId: string; exp: number; nonce: string };

export async function mintApproval(requestId: string, amountCents: number, pledgeId: string): Promise<string> {
  const claims: ApprovalClaims = { requestId, amountCents, pledgeId, exp: Date.now() + 5 * 60_000, nonce: crypto.randomUUID() };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token = `${body}.${sign(body)}`;
  await sql('INSERT INTO approval (id, request_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)', [newId('apr'), requestId, hash(token), new Date(claims.exp)]);
  return token;
}

// Verifies the signature, expiry and single use, and marks it used. Throws on any failure.
export async function consumeApproval(token: string): Promise<ApprovalClaims> {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) throw new Error('Approval missing');
  const expected = sign(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new Error('Approval signature invalid');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as ApprovalClaims;
  if (claims.exp < Date.now()) throw new Error('Approval expired');
  const row = await one('UPDATE approval SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL RETURNING id', [hash(token)]);
  if (!row) throw new Error('Approval already used or unknown');
  return claims;
}
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

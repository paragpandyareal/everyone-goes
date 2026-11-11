// Anti-abuse controls. Two principles hold throughout:
//  1. Dignity: no means testing, no proof requests. Controls are limits and second looks, never interrogation.
//  2. Privacy: signals reach the coordinator as counts ("2nd cover this term"), never as identities.
// Money from a cover can only ever pay the family's own PayPal invoice. Nothing is paid out to the person asking,
// so the abuse to stop is "free places" and draining sponsor pledges, not cash extraction.
import crypto from 'node:crypto';
import { one } from '../db';

export const LIMITS = {
  familyCoversPerTerm: Number(process.env.FAMILY_COVERS_PER_TERM || 3), // soft: second look above this
  termDays: Number(process.env.TERM_DAYS || 120),
  classCoverShare: Number(process.env.CLASS_COVER_SHARE || 0.34), // soft: second look above this share of a class
  pledgeCoversPerDay: Number(process.env.PLEDGE_COVERS_PER_DAY || 6), // hard
  globalCoversPerDay: Number(process.env.GLOBAL_COVERS_PER_DAY || 30), // hard
  requestsPerLinkPerDay: Number(process.env.REQUESTS_PER_LINK_PER_DAY || 4), // hard
  collectionsPerDay: Number(process.env.COLLECTIONS_PER_DAY || 6), // hard (public demo)
  pledgesPerDay: Number(process.env.PLEDGES_PER_DAY || 25), // hard (public demo)
};

// A pseudonymous tag for a family across collections, from the parent email. Not reversible without the server key.
export function familyTag(parentEmail: string): string {
  if (!process.env.LINK_TABLE_KEY && process.env.NODE_ENV === 'production') throw new Error('LINK_TABLE_KEY must be set in production');
  return crypto.createHmac('sha256', process.env.LINK_TABLE_KEY || 'dev-only-link-table-key-change-me').update(`fam:${parentEmail.trim().toLowerCase()}`).digest('base64url').slice(0, 22);
}

export type Signals = { familyCoversThisTerm: number; classCovers: number; classSize: number; reasons: string[] };

// Soft signals: shown as counts on the card, and they require "Approve anyway" (recorded in the trace).
export async function softSignals(familyTagValue: string | null, collectionId: string): Promise<Signals> {
  const fam = familyTagValue ? await one(`SELECT count(*)::int AS n FROM cover WHERE family_tag=$1 AND status IN ('CHARGED','RECORDED') AND created_at > now() - ($2 || ' days')::interval`, [familyTagValue, String(LIMITS.termDays)]) : { n: 0 };
  const cls = await one(`SELECT count(*)::int AS n FROM cover WHERE collection_id=$1 AND status IN ('CHARGED','RECORDED')`, [collectionId]);
  const size = await one('SELECT count(*)::int AS n FROM family WHERE collection_id=$1', [collectionId]);
  const reasons: string[] = [];
  if (fam.n >= LIMITS.familyCoversPerTerm) reasons.push(`This family has already had ${fam.n} covers this term (limit ${LIMITS.familyCoversPerTerm})`);
  if (size.n && (cls.n + 1) / size.n > LIMITS.classCoverShare) reasons.push(`This would cover ${cls.n + 1} of ${size.n} families in this collection, above the ${Math.round(LIMITS.classCoverShare * 100)}% second look line`);
  return { familyCoversThisTerm: fam.n, classCovers: cls.n, classSize: size.n, reasons };
}

// Hard caps: cannot be overridden from the console.
export async function hardCapProblems(pledgeId: string): Promise<string[]> {
  const out: string[] = [];
  const p = await one("SELECT count(*)::int AS n FROM cover WHERE pledge_id=$1 AND status IN ('CHARGED','RECORDED','APPROVED') AND created_at > now() - interval '1 day'", [pledgeId]);
  if (p.n >= LIMITS.pledgeCoversPerDay) out.push(`This pledge has paid ${p.n} covers in the last 24 hours (daily limit ${LIMITS.pledgeCoversPerDay}). It protects sponsors from a burst of charges.`);
  const g = await one("SELECT count(*)::int AS n FROM cover WHERE status IN ('CHARGED','RECORDED','APPROVED') AND created_at > now() - interval '1 day'");
  if (g.n >= LIMITS.globalCoversPerDay) out.push(`The service has reached its daily limit of ${LIMITS.globalCoversPerDay} covers. Try again tomorrow.`);
  return out;
}

export async function linkRequestProblems(helpToken: string): Promise<string | null> {
  const open = await one("SELECT id FROM help_request WHERE help_token=$1 AND status IN ('NEW','PROPOSED','CHARGING','NEEDS_SPONSOR') LIMIT 1", [helpToken]);
  if (open) return 'You already have a message we are looking at. We will reply here.';
  const day = await one("SELECT count(*)::int AS n FROM help_request WHERE help_token=$1 AND created_at > now() - interval '1 day'", [helpToken]);
  if (day.n >= LIMITS.requestsPerLinkPerDay) return 'You have sent several messages today. Please wait until tomorrow, or speak to the school office.';
  const covered = await one("SELECT id FROM help_request WHERE help_token=$1 AND status='COVERED' LIMIT 1", [helpToken]);
  if (covered) return null; // a question after a cover is fine; the invoice is paid so no second cover can happen
  return null;
}

export async function dailyCount(table: 'collection' | 'pledge', seededExcluded = true): Promise<number> {
  const r = await one(`SELECT count(*)::int AS n FROM ${table} WHERE created_at > now() - interval '1 day'${seededExcluded && table === 'pledge' ? ' AND seeded=false' : ''}`);
  return r.n;
}

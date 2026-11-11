// Collections, the seeded class roster, invoice issuing and help requests.
import crypto from 'node:crypto';
import { sql, one, newId } from '../db';
import { seal } from '../privacy/seal';
import { createAndSend, qrCode } from '../paypal/invoices';
import { hasApp } from '../paypal/client';
import { ptrace } from '../trace';
import type { Draft } from '../agent/small';
import { familyTag, linkRequestProblems } from './abuse';

export class UserFacingError extends Error { status = 409; }

// Fictional class. Child names live only in this app: never sent to PayPal or the AI.
export const ROOM12: [string, string][] = [
  ['Ava', 'Grace Thompson'], ['Mateo', 'Lucia Hernandez'], ['Liam', 'Daniel Brooks'], ['Mia', 'Thanh Nguyen'], ['Noah', 'Aisha Rahman'],
  ['Sofia', 'Ana Pereira'], ['Ethan', 'Mark Sullivan'], ['Zofia', 'Katarzyna Nowak'], ['Lucas', 'Rafael Ortiz'], ['Amara', 'Ngozi Okafor'],
  ['Leo', 'Wei Chen'], ['Isla', 'Hannah Fischer'], ['Omar', 'Yusuf Haddad'], ['Chloe', 'Megan Price'], ['Diego', 'Rosa Jimenez'],
  ['Hana', 'Linh Tran'], ['Jacob', 'Peter Walsh'], ['Maya', 'Priya Patel'], ['Gabriel', 'Joao Santos'], ['Ella', 'Sarah Kim'],
  ['Ali', 'Fatima Siddiqui'], ['Ruby', 'Jessica Moore'], ['Samuel', 'Emmanuel Mensah'], ['Lily', 'Marisol Cruz'],
];
export const HERO_INDEX = 7; // Zofia's family, code F-07
export const SOCCER: [string, string][] = ROOM12.slice(0, 16);

function codes(n: number, hero?: number): string[] {
  const pool = Array.from({ length: 89 }, (_, i) => i + 10).filter((x) => x !== 7);
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return Array.from({ length: n }, (_, i) => (i === hero ? 'F-07' : `F-${pool[i]}`));
}
const parentEmail = (i: number, name: string) => {
  const real = (process.env.PARENT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return real[i] || `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.room12@example.com`;
};
export const helpUrl = (token: string) => `${process.env.APP_BASE_URL || 'http://localhost:3100'}/help/${token}`;

export function invoiceNote(kind: string, token: string) {
  const what = kind === 'TRIP' ? 'this trip' : 'this';
  return `Requested contribution. No child will miss ${what} because of cost. Need help or more time? Tell us privately at ${helpUrl(token)}`;
}

export async function createCollection(draft: Draft, sentence: string, roster: [string, string][], opts: { heroIndex?: number } = {}): Promise<string> {
  const id = newId('col');
  await sql('INSERT INTO collection (id, title, kind, amount_cents, due_date, sentence) VALUES ($1,$2,$3,$4,$5,$6)', [id, draft.title, draft.kind, draft.amount_cents, draft.due_date, sentence]);
  const cs = codes(roster.length, opts.heroIndex);
  for (let i = 0; i < roster.length; i++) {
    const fid = newId('fam');
    const email = parentEmail(i, roster[i][1]);
    await sql('INSERT INTO family (id, collection_id, code, parent_email, parent_name, child_first, help_token, sort, scripted, family_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)',
      [fid, id, cs[i], email, roster[i][1], roster[i][0], crypto.randomBytes(18).toString('base64url'), i, familyTag(email)]);
    await sql('INSERT INTO invoice (id, family_id, amount_cents) VALUES ($1,$2,$3)', [newId('inv'), fid, draft.amount_cents]);
  }
  await ptrace({ scope: `col:${id}`, actor: 'teacher', tool: 'confirm_collection', via: 'Code', summary: `Teacher confirmed "${draft.title}", ${roster.length} families, ${(draft.amount_cents / 100).toFixed(2)} USD`, approvedBy: 'teacher' });
  return id;
}

// Issues the invoices through the Agent Toolkit, 4 at a time. Safe to call again: skips invoices already issued.
export async function issueInvoices(collectionId: string) {
  if (!hasApp('trips')) return;
  const coll = await one('SELECT * FROM collection WHERE id=$1', [collectionId]);
  const rows = await sql("SELECT i.id AS inv_id, f.* FROM invoice i JOIN family f ON f.id=i.family_id WHERE f.collection_id=$1 AND i.paypal_invoice_id IS NULL ORDER BY f.sort", [collectionId]);
  let first = true;
  const work = async (f: any) => {
    await sql("UPDATE invoice SET status='ISSUING' WHERE id=$1", [f.inv_id]);
    try {
      const r = await createAndSend(`col:${collectionId}`, { email: f.parent_email, reference: `R12-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, itemName: coll.title.toLowerCase().startsWith('requested') ? coll.title : `Requested contribution, ${coll.title}`, amountCents: coll.amount_cents, note: invoiceNote(coll.kind, f.help_token), dueDate: coll.due_date || undefined });
      await sql("UPDATE invoice SET paypal_invoice_id=$2, pay_url=$3, status='SENT', last_sync=now() WHERE id=$1", [f.inv_id, r.invoiceId, r.payUrl]);
      if (first) {
        first = false;
        const qr = await qrCode(`col:${collectionId}`, r.invoiceId);
        if (qr) await sql("INSERT INTO kv (k, v) VALUES ($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2", [`qr:${collectionId}`, qr]);
      }
    } catch (e: any) {
      await sql("UPDATE invoice SET status='ERROR' WHERE id=$1", [f.inv_id]);
      await ptrace({ scope: `col:${collectionId}`, actor: 'agent', tool: 'create_invoice', via: 'REST', summary: `One invoice failed: ${String(e.message).slice(0, 120)}`, ok: false });
    }
  };
  for (let i = 0; i < rows.length; i += 4) await Promise.all(rows.slice(i, i + 4).map(work));
}

export async function newHelpRequest(helpToken: string, text: string, scripted = false): Promise<string> {
  const fam = await one('SELECT * FROM family WHERE help_token=$1', [helpToken]);
  if (!fam) throw new UserFacingError('This link is not valid');
  if (!scripted) { const problem = await linkRequestProblems(helpToken); if (problem) throw new UserFacingError(problem); }
  const id = newId('req');
  await sql('INSERT INTO help_request (id, help_token, code, collection_id, sealed_family, raw_enc, scripted) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, helpToken, fam.code, fam.collection_id, seal(fam.id), seal(text.slice(0, 2000)), scripted]);
  return id;
}

export async function activeCollectionId(): Promise<string | null> {
  const k = await one("SELECT v FROM kv WHERE k='active_collection'");
  if (k?.v) return k.v;
  const c = await one("SELECT id FROM collection WHERE status='OPEN' ORDER BY created_at LIMIT 1");
  return c?.id || null;
}

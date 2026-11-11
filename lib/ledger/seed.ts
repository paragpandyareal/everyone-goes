// PRD 11. Seeding the demo class honestly, and the one button demo reset (PRD 11.1).
import { sql, one, newId } from '../db';
import { seal, unseal } from '../privacy/seal';
import { mintApproval } from '../approval';
import { createCollection, issueInvoices, newHelpRequest, ROOM12, SOCCER, HERO_INDEX, invoiceNote } from './collections';
import { performCover, syncCollection, publicRef, syncInvoice } from './service';
import { recordPayment, cancelInvoice, createAndSend } from '../paypal/invoices';
import { deletePaymentToken, createSetupToken } from '../paypal/coverfund';
import { triage } from '../agent/triage';
import { ptrace } from '../trace';

// Which rows play which part. 8 real parent payments by hand, 3 real sponsor covers, 7 office payments, 6 left unpaid.
export const PARENT_PAY = [0, 1, 3, 4, 5, 6, 8, 9];
export const SEED_COVERS = [10, 13, 17];
export const OFFICE = [12, 14, 16, 18, 20, 21, 23];
export const UNPAID = [2, HERO_INDEX, 11, 15, 19, 22];
const SCRIPTED: [number, string][] = [
  [11, '¿A qué hora salen y a qué hora regresan del museo? Necesito organizar la recogida.'],
  [15, "Sorry, he won't be going on Friday, we're away that weekend."],
  [19, "Can we pay for this one? Also he says he's scared to go home after school when his uncle is there."],
];
const SEED_HARDSHIP = ["We can't manage the trip money this month, sorry.", 'Money is really tight right now, is there any help?', 'We would love her to go but we cannot pay this time.'];

const famAt = async (collectionId: string, idx: number) => one('SELECT f.*, i.id AS inv_row, i.paypal_invoice_id FROM family f JOIN invoice i ON i.family_id=f.id WHERE f.collection_id=$1 AND f.sort=$2', [collectionId, idx]);

export async function seedClass() {
  for (const t of ['approval', 'cover', 'help_request', 'lead_item', 'invoice', 'family', 'collection', 'ptrace', 'agent_run', 'settlement']) await sql(`DELETE FROM ${t}`);
  await sql("DELETE FROM kv WHERE k LIKE 'qr:%' OR k IN ('active_collection','trip_collection')");
  const soccer = await createCollection({ title: 'Spring soccer registration', kind: 'CLUB_FEE', amount_cents: 12000, due_date: null, item_name: 'Requested contribution, spring soccer registration', warning: null }, 'Spring soccer registration, $120 requested contribution', SOCCER);
  const trip = await createCollection({ title: 'Museum trip, Friday', kind: 'TRIP', amount_cents: 4500, due_date: null, item_name: 'Requested contribution, museum trip', warning: null }, 'Museum trip, Friday, $45 requested contribution', ROOM12, { heroIndex: HERO_INDEX });
  await sql("INSERT INTO kv (k, v) VALUES ('active_collection', $1), ('trip_collection', $1) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v", [trip]);
  await issueInvoices(trip);
  issueInvoices(soccer).catch(() => {});
  return { trip, soccer };
}

export async function tripId(): Promise<string> {
  const r = await one("SELECT v FROM kv WHERE k='trip_collection'");
  if (!r) throw new Error('Seed the class first');
  return r.v;
}

export async function seedSponsorStart(name: string, capCents: number, perChild: number, text: string) {
  const sid = newId('spn'), pid = newId('plg');
  await sql('INSERT INTO sponsor (id, display_name) VALUES ($1,$2)', [sid, name]);
  await sql("INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, conditions_text, conditions_tags, seeded) VALUES ($1,$2,$3,$4,$5,'any',true)", [pid, sid, capCents, perChild, text]);
  const r = await createSetupToken(pid);
  if (!r.ok) throw new Error(`setup token ${r.status} debug ${r.debugId}`);
  await sql('UPDATE pledge SET setup_token=$2 WHERE id=$1', [pid, r.body.id]);
  return { pledgeId: pid, approveUrl: r.body.links?.find((l: any) => l.rel === 'approve')?.href };
}

export async function seedCovers() {
  const trip = await tripId();
  const p = await one("SELECT * FROM pledge WHERE seeded=true AND status='ACTIVE' ORDER BY created_at LIMIT 1");
  if (!p) throw new Error('Save the seeded sponsor first');
  const out = [];
  for (let k = 0; k < SEED_COVERS.length; k++) {
    const f = await famAt(trip, SEED_COVERS[k]);
    const existing = await one("SELECT id FROM help_request WHERE help_token=$1 AND status='COVERED'", [f.help_token]);
    if (existing) continue;
    const id = await newHelpRequest(f.help_token, SEED_HARDSHIP[k], true);
    await sql("UPDATE help_request SET status='PROPOSED', category='HARDSHIP', kind_of_help='FULL_COVER', amount_cents=4500, pledge_id=$2, summary='asks for help · cover $45', reply_text='Thank you for telling us. It is all taken care of and your child is going.', reply_en='Thank you for telling us. It is all taken care of and your child is going.', confidence='HIGH', fallback='SEEDED' WHERE id=$1", [id, p.id]);
    out.push(await performCover(await mintApproval(id, 4500, p.id)));
  }
  return out;
}

export async function seedOffice() {
  const trip = await tripId();
  let n = 0;
  for (const idx of OFFICE) {
    const f = await famAt(trip, idx);
    const inv = await syncInvoice(await one('SELECT * FROM invoice WHERE id=$1', [f.inv_row]), true);
    if (/PAID/.test(inv.status)) continue;
    await recordPayment(`col:${trip}`, f.paypal_invoice_id, 4500, publicRef(), 'seed');
    await sql('UPDATE invoice SET seeded=true WHERE id=$1', [f.inv_row]);
    n++;
  }
  await syncCollection(trip);
  return { recorded: n };
}

export async function seedMessages() {
  const trip = await tripId();
  for (const [idx, text] of SCRIPTED) {
    const f = await famAt(trip, idx);
    const has = await one('SELECT id FROM help_request WHERE help_token=$1', [f.help_token]);
    if (has) continue;
    const id = await newHelpRequest(f.help_token, text, true);
    await triage(id);
  }
  return { ok: true };
}

export async function parentLinks() {
  const trip = await tripId();
  const rows = await sql('SELECT f.sort, f.code, f.parent_email, i.pay_url, i.status FROM family f JOIN invoice i ON i.family_id=f.id WHERE f.collection_id=$1 ORDER BY f.sort', [trip]);
  return rows.filter((r) => PARENT_PAY.includes(r.sort)).map((r) => ({ payUrl: r.pay_url, status: r.status, email: r.parent_email }));
}

// One button reset (PRD 11.1). PayPal history is never deleted.
export async function resetDemo(opts: { keepSponsors?: boolean } = {}) {
  const last = await one("SELECT v FROM kv WHERE k='last_reset'");
  if (last && Date.now() - Number(last.v) < 60_000) throw Object.assign(new Error('Reset was used less than a minute ago'), { publicMessage: 'The demo was reset less than a minute ago. Wait a minute and try again.', status: 429 });
  await sql("INSERT INTO kv (k, v) VALUES ('last_reset', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [String(Date.now())]);
  const trip = await tripId();
  const coll = await one('SELECT * FROM collection WHERE id=$1', [trip]);
  // Requests made after seeding go, with their traces and lead items.
  const reqs = await sql('SELECT id, sealed_family FROM help_request WHERE scripted=false');
  for (const r of reqs) { await sql('DELETE FROM ptrace WHERE scope=$1', [`req:${r.id}`]); await sql('DELETE FROM lead_item WHERE request_id=$1', [r.id]); await sql('DELETE FROM approval WHERE request_id=$1', [r.id]); }
  await sql('DELETE FROM help_request WHERE scripted=false');
  // The 6 unpaid rows go back to unpaid: cancel any changed invoice and issue a fresh one.
  for (const idx of UNPAID) {
    const f = await famAt(trip, idx);
    const inv = await syncInvoice(await one('SELECT * FROM invoice WHERE id=$1', [f.inv_row]), true);
    if (inv.status === 'SENT' || inv.status === 'UNPAID') { await sql('UPDATE invoice SET reminders_paused=false WHERE id=$1', [inv.id]); continue; }
    if (inv.paypal_invoice_id && !/^(PAID|MARKED_AS_PAID|CANCELLED)$/.test(inv.status)) await cancelInvoice(`col:${trip}`, inv.paypal_invoice_id).catch(() => {});
    const r = await createAndSend(`col:${trip}`, { email: f.parent_email, reference: `R12-${Math.random().toString(16).slice(2, 8).toUpperCase()}`, itemName: 'Requested contribution, museum trip', amountCents: coll.amount_cents, note: invoiceNote(coll.kind, f.help_token) }, 'system');
    await sql("UPDATE invoice SET paypal_invoice_id=$2, pay_url=$3, status='SENT', paid_cents=0, tip_cents=0, paid_via=NULL, seeded=false, reminders_paused=false, last_sync=now(), updated_at=now() WHERE id=$1", [inv.id, r.invoiceId, r.payUrl]);
  }
  if (!opts.keepSponsors) {
    for (const p of await sql("SELECT * FROM pledge WHERE seeded=false AND status IN ('ACTIVE','EXHAUSTED','PENDING')")) {
      if (p.vault_id) await deletePaymentToken(p.vault_id).catch(() => {});
      await sql("UPDATE pledge SET status='STOPPED', vault_id=NULL WHERE id=$1", [p.id]);
    }
  }
  await ptrace({ scope: `col:${trip}`, actor: 'system', tool: 'demo_reset', via: 'Code', summary: 'Demo reset: 6 unpaid rows reissued, new requests cleared' });
  return { ok: true };
}
export { unseal, seal };

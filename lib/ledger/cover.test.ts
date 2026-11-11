// Integration tests of the money path: real database (PGlite in memory), real approval tokens, real ledger code.
// Only the PayPal network calls are mocked.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

process.env.PGLITE_DIR = 'memory://';
process.env.TRIPS_CLIENT_ID = 'x'; process.env.TRIPS_CLIENT_SECRET = 'x';
process.env.FAMILY_COVERS_PER_TERM = '1';
process.env.PLEDGE_COVERS_PER_DAY = '50';

const charges: any[] = [];
const refunds: any[] = [];
const flakySeen = new Set<string>();
const recorded: any[] = [];
const invoiceState = new Map<string, { status: string; paid: number }>();

vi.mock('../paypal/coverfund', () => ({
  chargeVault: vi.fn(async (coverId: string, ref: string, vaultId: string, amount: number) => {
    charges.push({ coverId, vaultId, amount });
    if (vaultId === 'flaky' && !flakySeen.has(coverId)) { flakySeen.add(coverId); return { ok: false, status: 503, debugId: 'dbg', body: { name: 'SERVICE_UNAVAILABLE' } }; }
    if (vaultId === 'down') return { ok: false, status: 503, debugId: 'dbg', body: { name: 'SERVICE_UNAVAILABLE' } };
    if (vaultId === 'declines') return { ok: false, status: 422, debugId: 'dbg', body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] } };
    return { ok: true, status: 201, debugId: 'dbg', body: { id: `ORDER-${coverId}`, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: `CAP-${coverId}`, status: 'COMPLETED' }] } }] } };
  }),
  refundCapture: vi.fn(async (captureId: string) => { refunds.push(captureId); return { ok: true, status: 201, debugId: 'dbg', body: { id: 'REF-1' } }; }),
  settlementPayout: vi.fn(), getPayout: vi.fn(),
}));
vi.mock('../paypal/invoices', () => ({
  getInvoice: vi.fn(async (id: string) => { const s = invoiceState.get(id)!; return { status: s.status, paidCents: s.paid, tipCents: 0, dueCents: 4500 - s.paid, payUrl: null, viaPayPal: false, viaRecorded: s.paid > 0 }; }),
  recordPayment: vi.fn(async (_scope: string, id: string, amount: number) => { recorded.push({ id, amount }); const s = invoiceState.get(id)!; s.paid += amount; s.status = s.paid >= 4500 ? 'MARKED_AS_PAID' : 'PARTIALLY_PAID'; }),
}));

import { sql, one } from '../db';
import { seal } from '../privacy/seal';
import { mintApproval } from '../approval';
import { performCover, reconcileCovers } from './service';
import { newHelpRequest, UserFacingError } from './collections';
import { familyTag } from './abuse';

let n = 0;
async function family(email = `p${++n}@example.com`, collection = 'col_a') {
  const fid = `fam_${++n}`, inv = `INV2-TEST-${n}`;
  await sql('INSERT INTO family (id, collection_id, code, parent_email, help_token, family_tag) VALUES ($1,$2,$3,$4,$5,$6)', [fid, collection, `F-${n}`, email, `tok_${n}`, familyTag(email)]);
  await sql("INSERT INTO invoice (id, family_id, paypal_invoice_id, amount_cents, status) VALUES ($1,$2,$3,4500,'SENT')", [`inv_${n}`, fid, inv]);
  invoiceState.set(inv, { status: 'SENT', paid: 0 });
  return { fid, inv, token: `tok_${n}` };
}
async function proposal(fid: string, pledge = 'plg_rosa', amount = 4500) {
  const id = `req_${++n}`;
  await sql("INSERT INTO help_request (id, help_token, code, collection_id, sealed_family, raw_enc, status, amount_cents, pledge_id) SELECT $1, help_token, code, collection_id, $2, $3, 'PROPOSED', $4, $5 FROM family WHERE id=$6",
    [id, seal(fid), seal('test'), amount, pledge, fid]);
  return id;
}
const approve = async (id: string, override = false) => { const r = await one('SELECT * FROM help_request WHERE id=$1', [id]); return performCover(await mintApproval(id, r.amount_cents, r.pledge_id), override); };

beforeAll(async () => {
  for (const c of ['col_a', 'col_b']) await sql("INSERT INTO collection (id, title, kind, amount_cents) VALUES ($1,'Trip','TRIP',4500)", [c]);
  await sql("INSERT INTO sponsor (id, display_name) VALUES ('spn_rosa','Rosa')");
});
beforeEach(async () => {
  charges.length = 0; recorded.length = 0; refunds.length = 0;
  await sql('UPDATE invoice SET cover_lock=NULL');
  await sql('DELETE FROM cover'); await sql('DELETE FROM pledge');
  await sql("INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, vault_id, status) VALUES ('plg_rosa','spn_rosa',25000,6000,'vault_rosa','ACTIVE')");
  // pad col_a with 20 families so the class share signal does not fire in ordinary tests
  if (!(await one("SELECT 1 AS x FROM family WHERE id='pad_0'"))) for (let i = 0; i < 20; i++) await sql("INSERT INTO family (id, collection_id, code, help_token) VALUES ($1,'col_a','P',$2)", [`pad_${i}`, `padtok_${i}`]);
});

describe('cover money path', () => {
  it('charges the sponsor once and records on the invoice', async () => {
    const f = await family();
    const r = await approve(await proposal(f.fid));
    expect(r.ok).toBe(true);
    expect(charges).toHaveLength(1);
    expect(recorded).toEqual([{ id: f.inv, amount: 4500 }]);
    expect((await one("SELECT used_cents FROM pledge WHERE id='plg_rosa'")).used_cents).toBe(4500);
  });

  it('a replayed or second approval never charges twice', async () => {
    const f = await family();
    const id = await proposal(f.fid);
    const token = await mintApproval(id, 4500, 'plg_rosa');
    expect((await performCover(token)).ok).toBe(true);
    await expect(performCover(token)).rejects.toThrow(/already used/);
    expect((await approve(id).catch(() => ({ ok: false }))).ok).toBe(false);
    expect(charges).toHaveLength(1);
  });

  it('a forged approval is refused', async () => {
    const f = await family();
    const id = await proposal(f.fid);
    const t = await mintApproval(id, 4500, 'plg_rosa');
    const [body] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), amountCents: 50000 })).toString('base64url') + '.' + t.split('.')[1];
    await expect(performCover(forged)).rejects.toThrow(/signature/);
    expect(charges).toHaveLength(0);
  });

  it('refuses more than the amount still due (the "cover $500" injection)', async () => {
    const f = await family();
    const r = await approve(await proposal(f.fid, 'plg_rosa', 50000));
    expect(r.ok).toBe(false);
    expect(charges).toHaveLength(0);
  });

  it('refuses an invoice that is already paid', async () => {
    const f = await family();
    invoiceState.get(f.inv)!.status = 'PAID'; invoiceState.get(f.inv)!.paid = 4500;
    expect((await approve(await proposal(f.fid))).ok).toBe(false);
    expect(charges).toHaveLength(0);
  });

  it('respects the pledge total cap and falls back to no charge when no pledge fits', async () => {
    await sql("UPDATE pledge SET used_cents=24000 WHERE id='plg_rosa'");
    const f = await family();
    const r = await approve(await proposal(f.fid));
    expect(r.ok).toBe(false);
    expect(charges).toHaveLength(0);
  });

  it('a declined sponsor charge is never moved to another sponsor without a new approval', async () => {
    await sql("UPDATE pledge SET vault_id='declines' WHERE id='plg_rosa'");
    await sql("INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, vault_id, status) VALUES ('plg_b','spn_rosa',10000,6000,'vault_b','ACTIVE')");
    const f = await family();
    const id = await proposal(f.fid);
    const r = await approve(id);
    expect(r.ok).toBe(false);
    expect(charges.map((c) => c.vaultId)).toEqual(['declines']);
    expect((await one('SELECT status FROM help_request WHERE id=$1', [id])).status).toBe('NEEDS_SPONSOR');
    expect((await one("SELECT used_cents FROM pledge WHERE id='plg_rosa'")).used_cents).toBe(0); // reservation released
  });

  it('two requests for the same invoice approved at once charge only once', async () => {
    const f = await family();
    const a = await proposal(f.fid), b = await proposal(f.fid);
    const res = await Promise.all([approve(a), approve(b)]);
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    expect(charges).toHaveLength(1);
  });

  it('approvals at once can never pass the pledge cap', async () => {
    await sql("UPDATE pledge SET cap_cents=9000 WHERE id='plg_rosa'");
    const fs = [await family(), await family(), await family()];
    const ids = [await proposal(fs[0].fid), await proposal(fs[1].fid), await proposal(fs[2].fid)];
    const res = await Promise.all(ids.map((i) => approve(i)));
    expect(res.filter((x) => x.ok)).toHaveLength(2);
    expect((await one("SELECT used_cents FROM pledge WHERE id='plg_rosa'")).used_cents).toBe(9000);
  });

  it('a transient PayPal error is replayed with the same request id, charging once', async () => {
    await sql("UPDATE pledge SET vault_id='flaky' WHERE id='plg_rosa'");
    const f = await family();
    const r = await approve(await proposal(f.fid));
    expect(r.ok).toBe(true);
    expect(new Set(charges.map((c) => c.coverId)).size).toBe(1);
  });

  it('an unknown outcome is held, locks the invoice, and reconciles without a new charge id', async () => {
    await sql("UPDATE pledge SET vault_id='down' WHERE id='plg_rosa'");
    const f = await family();
    const id = await proposal(f.fid);
    const r = await approve(id);
    expect(r.ok).toBe(false);
    expect((await one('SELECT status FROM help_request WHERE id=$1', [id])).status).toBe('CHARGE_UNKNOWN');
    const other = await proposal(f.fid);
    expect((await approve(other)).ok).toBe(false); // invoice locked
    await sql("UPDATE pledge SET vault_id='vault_rosa' WHERE id='plg_rosa'");
    await reconcileCovers();
    expect((await one('SELECT status FROM help_request WHERE id=$1', [id])).status).toBe('COVERED');
    expect(new Set(charges.map((c) => c.coverId)).size).toBe(1);
    expect(recorded).toHaveLength(1);
  });

  it('if the family paid at the same moment, the sponsor is refunded', async () => {
    const f = await family();
    const id = await proposal(f.fid);
    const { recordPayment } = await import('../paypal/invoices');
    // first read (before charge) says unpaid; the read before recording says paid
    const { getInvoice } = await import('../paypal/invoices');
    let calls = 0;
    (getInvoice as any).mockImplementation(async () => (++calls === 1 ? { status: 'SENT', paidCents: 0, dueCents: 4500, tipCents: 0 } : { status: 'PAID', paidCents: 4500, dueCents: 0, tipCents: 0 }));
    const r = await approve(id);
    expect(r.ok).toBe(true);
    expect(refunds).toHaveLength(1);
    expect(recordPayment).not.toHaveBeenCalledWith(expect.anything(), f.inv, expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
    expect((await one("SELECT used_cents FROM pledge WHERE id='plg_rosa'")).used_cents).toBe(0);
    (getInvoice as any).mockImplementation(async (iid: string) => { const st = invoiceState.get(iid)!; return { status: st.status, paidCents: st.paid, tipCents: 0, dueCents: 4500 - st.paid }; });
  });
});

describe('anti-abuse', () => {
  it('a family over its term limit needs a second look, across collections, then can be approved on purpose', async () => {
    const email = 'repeat@example.com';
    const a = await family(email, 'col_a');
    expect((await approve(await proposal(a.fid))).ok).toBe(true);
    const b = await family(email, 'col_b');
    const id = await proposal(b.fid);
    const first = await approve(id);
    expect(first.ok).toBe(false);
    expect(first.needsReview).toBe(true);
    expect(charges).toHaveLength(1);
    const second = await approve(id, true);
    expect(second.ok).toBe(true);
    expect((await one('SELECT override_by FROM help_request WHERE id=$1', [id])).override_by).toBe('coordinator');
  });

  it('a high share of a class covered needs a second look', async () => {
    await sql("INSERT INTO collection (id, title, kind, amount_cents) VALUES ('col_small','Club','TRIP',4500) ON CONFLICT DO NOTHING");
    const fams = [await family(undefined, 'col_small'), await family(undefined, 'col_small')];
    expect((await approve(await proposal(fams[0].fid))).needsReview).toBe(true); // 1 of 2 = 50% > 34%
    expect(charges).toHaveLength(0);
  });

  it('one open request per help link, and a daily limit per link', async () => {
    const f = await family();
    await newHelpRequest(f.token, 'we cannot pay');
    await expect(newHelpRequest(f.token, 'please')).rejects.toBeInstanceOf(UserFacingError);
    await sql("UPDATE help_request SET status='ANSWERED' WHERE help_token=$1", [f.token]);
    for (let i = 0; i < 3; i++) { await newHelpRequest(f.token, `q${i}`); await sql("UPDATE help_request SET status='ANSWERED' WHERE help_token=$1", [f.token]); }
    await expect(newHelpRequest(f.token, 'again')).rejects.toThrow(/several messages today/);
  });

  it('an unknown help link is refused', async () => {
    await expect(newHelpRequest('nope', 'hi')).rejects.toBeInstanceOf(UserFacingError);
  });

  it('family tags are stable per email and not the email', () => {
    expect(familyTag('A@example.com ')).toBe(familyTag('a@example.com'));
    expect(familyTag('a@example.com')).not.toContain('example');
  });
});

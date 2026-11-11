// Ledger: invoice sync, pledges, covers, settlement and counters.
import crypto from 'node:crypto';
import { sql, one, newId } from '../db';
import { seal, unseal } from '../privacy/seal';
import { consumeApproval } from '../approval';
import { getInvoice, recordPayment } from '../paypal/invoices';
import { chargeVault, settlementPayout, getPayout } from '../paypal/coverfund';
import { hasApp, usd } from '../paypal/client';
import { ptrace } from '../trace';
import { pledgeProblems, coverAmountProblems, isPaid } from './rules';

export const publicRef = () => `EG-${crypto.randomInt(1000, 9999)}`;

// ---------- invoice status ----------
export async function syncInvoice(inv: any, force = false) {
  if (!inv?.paypal_invoice_id || !hasApp('trips')) return inv;
  if (!force && inv.last_sync && Date.now() - new Date(inv.last_sync).getTime() < 8000) return inv;
  if (!force && /^(PAID|MARKED_AS_PAID|CANCELLED)$/.test(inv.status)) return inv;
  try {
    const s = await getInvoice(inv.paypal_invoice_id);
    const paidVia = s.viaPayPal ? 'PAYPAL' : s.viaRecorded ? 'RECORDED' : null;
    const row = await one(`UPDATE invoice SET status=$2, paid_cents=$3, tip_cents=$4, pay_url=COALESCE($5, pay_url), paid_via=COALESCE($6, paid_via), last_sync=now(), updated_at=CASE WHEN status<>$2 THEN now() ELSE updated_at END
      WHERE id=$1 RETURNING *`, [inv.id, s.status, s.paidCents, s.tipCents, s.payUrl, paidVia]);
    return row;
  } catch {
    await sql('UPDATE invoice SET last_sync=now() WHERE id=$1', [inv.id]);
    return inv;
  }
}

export async function syncCollection(collectionId: string) {
  const rows = await sql(`SELECT i.* FROM invoice i JOIN family f ON f.id=i.family_id WHERE f.collection_id=$1 AND i.paypal_invoice_id IS NOT NULL AND i.status NOT IN ('PAID','MARKED_AS_PAID','CANCELLED')`, [collectionId]);
  for (let i = 0; i < rows.length; i += 6) await Promise.all(rows.slice(i, i + 6).map((r) => syncInvoice(r)));
}

// ---------- pledges ----------
export async function pledgesFor(kind: string): Promise<any[]> {
  const rows = await sql("SELECT p.*, s.display_name FROM pledge p JOIN sponsor s ON s.id=p.sponsor_id WHERE p.status='ACTIVE' ORDER BY p.created_at");
  return rows.map((p) => ({ ...p, left_cents: p.cap_cents - p.used_cents, fits_kind: pledgeProblems(p as any, kind, 1).every((e) => !e.includes('conditions')) }));
}

// ---------- the cover (PRD 3.3 steps 5 to 9, PRD 7.2 state rules) ----------
export async function performCover(approvalToken: string): Promise<{ ok: boolean; message: string; captureId?: string; ref?: string }> {
  const claims = await consumeApproval(approvalToken);
  // Atomic claim on the request: only one approval can ever charge it.
  const req = await one("UPDATE help_request SET status='CHARGING', updated_at=now() WHERE id=$1 AND status='PROPOSED' RETURNING *", [claims.requestId]);
  if (!req) return { ok: false, message: 'This request is not waiting for approval (already handled?)' };
  const fail = async (message: string, status = 'PROPOSED') => {
    await sql('UPDATE help_request SET status=$2, updated_at=now(), fallback=$3 WHERE id=$1', [req.id, status, message]);
    return { ok: false, message };
  };
  if (claims.amountCents !== req.amount_cents || claims.pledgeId !== req.pledge_id) return fail('Approval does not match the proposal');

  const familyId = unseal(req.sealed_family);
  const coll = await one('SELECT c.* FROM collection c JOIN family f ON f.collection_id=c.id WHERE f.id=$1', [familyId]);
  let inv = await one('SELECT * FROM invoice WHERE family_id=$1', [familyId]);
  inv = await syncInvoice(inv, true);
  const dueCents = Math.max(0, coll.amount_cents - (inv.paid_cents || 0));
  const amountErr = coverAmountProblems(req.amount_cents, dueCents, inv.status);
  if (amountErr.length) return fail(`Refused by code: ${amountErr.join('; ')}`);

  // Try the proposed pledge, then one other matching pledge (PRD 7.2).
  const candidates = [await one('SELECT * FROM pledge WHERE id=$1', [req.pledge_id]), ...(await sql("SELECT * FROM pledge WHERE status='ACTIVE' AND id<>$1 ORDER BY created_at", [req.pledge_id]))].filter(Boolean);
  let tries = 0;
  for (const p of candidates) {
    const problems = pledgeProblems(p, coll.kind, req.amount_cents);
    if (problems.length) { await ptrace({ scope: `req:${req.id}`, actor: 'system', tool: 'check_pledge', via: 'Code', summary: `Pledge ${p.id.slice(-4)} skipped: ${problems.join('; ')}`, ok: false }); continue; }
    if (tries++ >= 2) break;
    const coverId = newId('cov');
    const ref = publicRef();
    await sql('INSERT INTO cover (id, sealed_request, pledge_id, amount_cents, public_ref, status) VALUES ($1,$2,$3,$4,$5,$6)', [coverId, seal(req.id), p.id, req.amount_cents, ref, 'APPROVED']);
    const r = await chargeVault(coverId, ref, p.vault_id, req.amount_cents);
    const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
    const charged = r.ok && r.body?.status === 'COMPLETED' && cap?.status === 'COMPLETED';
    await ptrace({ scope: `req:${req.id}`, actor: 'system', tool: 'charge_pledge', via: 'REST', summary: charged ? `Sponsor absent PayPal capture ${usd(req.amount_cents)} from saved account, COMPLETED` : `Charge failed (${r.status} ${r.body?.details?.[0]?.issue || r.body?.name || ''})`, paypalId: cap?.id || r.body?.id, debugId: r.debugId, approvedBy: 'coordinator', ok: charged });
    if (!charged) {
      await sql("UPDATE cover SET status='FAILED', debug_id=$2, error=$3 WHERE id=$1", [coverId, r.debugId, JSON.stringify(r.body?.details || r.body?.name || r.status)]);
      continue;
    }
    await sql("UPDATE cover SET status='CHARGED', paypal_order_id=$2, capture_id=$3, debug_id=$4 WHERE id=$1", [coverId, r.body.id, cap.id, r.debugId]);
    await sql('UPDATE pledge SET used_cents = used_cents + $2, status = CASE WHEN used_cents + $2 >= cap_cents THEN \'EXHAUSTED\' ELSE status END WHERE id=$1', [p.id, req.amount_cents]);
    // Record on the family's invoice. Retry, never re-charge.
    let recorded = false;
    for (let i = 0; i < 3 && !recorded; i++) {
      try { await recordPayment(`req:${req.id}`, inv.paypal_invoice_id, req.amount_cents, ref, 'system', 'coordinator'); recorded = true; } catch { await new Promise((s) => setTimeout(s, 1500)); }
    }
    await sql("UPDATE cover SET recorded=$2, status=$3 WHERE id=$1", [coverId, recorded, recorded ? 'RECORDED' : 'CHARGED']);
    await sql("UPDATE help_request SET status='COVERED', updated_at=now(), fallback=NULL WHERE id=$1", [req.id]);
    await syncInvoice(inv, true);
    return { ok: true, message: recorded ? 'Covered and recorded' : 'Charged; recording on the invoice will retry', captureId: cap.id, ref };
  }
  return fail('No pledge could pay this cover. Returned to the coordinator.');
}

export async function retryUnrecorded() {
  for (const c of await sql("SELECT * FROM cover WHERE status='CHARGED' AND recorded=false AND seeded=false")) {
    const reqId = unseal(c.sealed_request);
    const req = await one('SELECT * FROM help_request WHERE id=$1', [reqId]);
    if (!req) continue;
    const inv = await one('SELECT * FROM invoice WHERE family_id=$1', [unseal(req.sealed_family)]);
    try { await recordPayment(`req:${reqId}`, inv.paypal_invoice_id, c.amount_cents, c.public_ref, 'system'); await sql("UPDATE cover SET recorded=true, status='RECORDED' WHERE id=$1", [c.id]); } catch {}
  }
}

// ---------- settlement (PRD 3.6) ----------
export async function settle(): Promise<any> {
  const covers = await sql("SELECT * FROM cover WHERE status IN ('CHARGED','RECORDED') AND settlement_id IS NULL AND seeded=false");
  if (!covers.length) return { ok: false, message: 'No unsettled covers' };
  const total = covers.reduce((a, c) => a + c.amount_cents, 0);
  const id = newId('set');
  await sql('INSERT INTO settlement (id, total_cents, cover_count) VALUES ($1,$2,$3)', [id, total, covers.length]);
  await sql('UPDATE cover SET settlement_id=$1 WHERE id = ANY($2)', [id, covers.map((c) => c.id)]);
  const r = await settlementPayout(id, total, covers.length);
  const batch = r.body?.batch_header?.payout_batch_id;
  await sql('UPDATE settlement SET batch_id=$2, status=$3, debug_id=$4 WHERE id=$1', [id, batch || null, r.ok ? r.body?.batch_header?.batch_status || 'PENDING' : 'FAILED', r.debugId]);
  await ptrace({ scope: 'treasurer', actor: 'coordinator', tool: 'create_payout', via: 'REST', summary: `${covers.length} covers = ${usd(total)}, one aggregated Payout item to the Trips account`, paypalId: batch, debugId: r.debugId, approvedBy: 'coordinator', ok: r.ok });
  if (!r.ok) { await sql('UPDATE cover SET settlement_id=NULL WHERE settlement_id=$1', [id]); return { ok: false, message: `Payout failed ${r.status}` }; }
  return { ok: true, id, batch };
}
export async function refreshSettlements() {
  for (const s of await sql("SELECT * FROM settlement WHERE batch_id IS NOT NULL AND status NOT IN ('SUCCESS','DENIED','CANCELED','FAILED') AND created_at > now() - interval '1 day'")) {
    const r = await getPayout(s.batch_id);
    if (r.ok) await sql('UPDATE settlement SET status=$2 WHERE id=$1', [s.id, r.body?.batch_header?.batch_status]);
  }
}

// ---------- counters (PRD 4.1: only numbers the app can measure) ----------
export async function counters(collectionId: string) {
  const r = await one(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE i.status IN ('PAID','MARKED_AS_PAID'))::int AS paid,
      count(*) FILTER (WHERE i.paid_via='PAYPAL')::int AS on_paypal,
      count(*) FILTER (WHERE i.status IN ('PAID','MARKED_AS_PAID') AND (i.paid_via IS DISTINCT FROM 'PAYPAL'))::int AS office_or_cover,
      COALESCE(sum(i.tip_cents),0)::int AS tips
    FROM invoice i JOIN family f ON f.id=i.family_id WHERE f.collection_id=$1`, [collectionId]);
  const s = await one("SELECT count(*)::int AS n FROM pledge WHERE vault_id IS NOT NULL AND status IN ('ACTIVE','EXHAUSTED')");
  return { ...r, sponsors_saved: s.n };
}

export const isPaidStatus = isPaid;

// Raw help messages are deleted after 30 days (PRD 7.1). Redacted text and the outcome stay for audit.
export async function purgeOldMessages() {
  const old = await sql("SELECT id FROM help_request WHERE created_at < now() - interval '30 days' AND raw_enc <> 'deleted'");
  for (const r of old) await sql("UPDATE help_request SET raw_enc='deleted' WHERE id=$1", [r.id]);
  return old.length;
}

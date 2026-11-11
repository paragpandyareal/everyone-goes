// Ledger: invoice sync, pledges, covers, settlement and counters.
import crypto from 'node:crypto';
import { sql, one, newId } from '../db';
import { seal, unseal } from '../privacy/seal';
import { consumeApproval } from '../approval';
import { getInvoice, recordPayment } from '../paypal/invoices';
import { chargeVault, settlementPayout, getPayout, refundCapture } from '../paypal/coverfund';
import { hasApp, usd } from '../paypal/client';
import { ptrace } from '../trace';
import { pledgeProblems, coverAmountProblems, isPaid } from './rules';
import { softSignals, hardCapProblems } from './abuse';

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
// Safety properties, each covered by lib/ledger/cover.test.ts:
//  - one approval charges at most once (atomic claim on the request + single use approval)
//  - one cover at a time per invoice (invoice lock), and never while an earlier cover is unrecorded
//  - the pledge cap is reserved atomically before charging, released on a definite decline
//  - only the approved pledge is charged; a decline returns the card to the coordinator
//  - an unclear PayPal result is retried with the same PayPal-Request-Id (PayPal replays the original), never a new charge
//  - if a parent paid at the same moment and the cover cannot be recorded, the sponsor is refunded
type CoverResult = { ok: boolean; message: string; captureId?: string; needsReview?: boolean };
const DEFINITE_DECLINE = (r: any) => r.status >= 400 && r.status < 500;

async function chargeWithReplay(coverId: string, ref: string, vaultId: string, amountCents: number) {
  let last: any = null;
  for (let i = 0; i < 3; i++) {
    try {
      last = await chargeVault(coverId, ref, vaultId, amountCents);
      if (last.status < 500) return last;
    } catch (e: any) { last = { ok: false, status: 0, debugId: null, body: { name: 'NETWORK', message: String(e?.message || e) } }; }
    await new Promise((s) => setTimeout(s, 800 * (i + 1)));
  }
  return last;
}

export async function performCover(approvalToken: string, override = false): Promise<CoverResult> {
  const claims = await consumeApproval(approvalToken);
  // Atomic claim on the request: only one approval can ever charge it.
  const req = await one("UPDATE help_request SET status='CHARGING', updated_at=now() WHERE id=$1 AND status='PROPOSED' RETURNING *", [claims.requestId]);
  if (!req) return { ok: false, message: 'This request is not waiting for approval (already handled?)' };
  const scope = `req:${req.id}`;
  const fail = async (message: string, status = 'PROPOSED') => {
    await sql('UPDATE help_request SET status=$2, updated_at=now(), fallback=$3 WHERE id=$1', [req.id, status, message]);
    return { ok: false, message };
  };
  if (claims.amountCents !== req.amount_cents || claims.pledgeId !== req.pledge_id) return fail('Approval does not match the proposal');

  const familyId = unseal(req.sealed_family);
  const coll = await one('SELECT c.* FROM collection c JOIN family f ON f.collection_id=c.id WHERE f.id=$1', [familyId]);
  const famRow = await one('SELECT family_tag FROM family WHERE id=$1', [familyId]);
  // Soft signals are re-checked at approval time (they may have changed since the proposal).
  const sig = await softSignals(famRow?.family_tag || null, coll.id);
  if (sig.reasons.length && !override) {
    await sql('UPDATE help_request SET review_reason=$2 WHERE id=$1', [req.id, sig.reasons.join(' · ')]);
    return { ...(await fail(`Second look needed: ${sig.reasons.join('; ')}`)), needsReview: true };
  }
  if (sig.reasons.length && override) {
    await sql("UPDATE help_request SET override_by='coordinator' WHERE id=$1", [req.id]);
    await ptrace({ scope, actor: 'coordinator', tool: 'second_look_override', via: 'Code', summary: `Coordinator approved after a second look: ${sig.reasons.join('; ')}`, approvedBy: 'coordinator' });
  }

  // One cover at a time per invoice. A lock older than 10 minutes is stale (crash) unless an earlier cover is still unrecorded.
  const inv0 = await one('SELECT * FROM invoice WHERE family_id=$1', [familyId]);
  const locked = await one("UPDATE invoice SET cover_lock=now() WHERE id=$1 AND (cover_lock IS NULL OR cover_lock < now() - interval '10 minutes') RETURNING *", [inv0.id]);
  if (!locked) return fail('Another cover for this invoice is in progress or waiting to be recorded');
  const unlock = () => sql('UPDATE invoice SET cover_lock=NULL WHERE id=$1', [inv0.id]);

  let state;
  try { state = await getInvoice(inv0.paypal_invoice_id); } catch { await unlock(); return fail('Could not read the invoice from PayPal. Try again.'); }
  const amountErr = coverAmountProblems(req.amount_cents, state.dueCents, state.status);
  if (amountErr.length) { await unlock(); return fail(`Refused by code: ${amountErr.join('; ')}`); }

  // Only the pledge the coordinator approved.
  const p = await one('SELECT * FROM pledge WHERE id=$1', [claims.pledgeId]);
  const problems = p ? [...pledgeProblems(p, coll.kind, req.amount_cents), ...(await hardCapProblems(p.id))] : ['pledge not found'];
  if (problems.length) {
    await unlock();
    await ptrace({ scope, actor: 'system', tool: 'check_pledge', via: 'Code', summary: `Not charged: ${problems.join('; ')}`, ok: false });
    return fail(`Not charged: ${problems.join('; ')}`, 'NEEDS_SPONSOR');
  }
  // Reserve the amount atomically, so two approvals at once can never pass the caps.
  const reserved = await one("UPDATE pledge SET used_cents=used_cents+$2 WHERE id=$1 AND status='ACTIVE' AND used_cents+$2<=cap_cents AND $2<=per_child_cap_cents RETURNING id", [p.id, req.amount_cents]);
  if (!reserved) { await unlock(); return fail('The pledge no longer has room for this amount', 'NEEDS_SPONSOR'); }
  const release = () => sql("UPDATE pledge SET used_cents=GREATEST(0, used_cents-$2), status=CASE WHEN status='EXHAUSTED' THEN 'ACTIVE' ELSE status END WHERE id=$1", [p.id, req.amount_cents]);

  const coverId = newId('cov');
  const ref = publicRef();
  await sql('INSERT INTO cover (id, sealed_request, pledge_id, amount_cents, public_ref, status, family_tag, collection_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [coverId, seal(req.id), p.id, req.amount_cents, ref, 'APPROVED', famRow?.family_tag || null, coll.id]);
  const r = await chargeWithReplay(coverId, ref, p.vault_id, req.amount_cents);
  const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
  const completed = r.ok && r.body?.status === 'COMPLETED' && (cap?.status === 'COMPLETED' || cap?.status === 'PENDING');
  await ptrace({ scope, actor: 'system', tool: 'charge_pledge', via: 'REST', summary: completed ? `Sponsor absent PayPal capture ${usd(req.amount_cents)} from the saved account, ${cap.status}` : `Charge not completed (${r.status} ${r.body?.details?.[0]?.issue || r.body?.name || ''})`, paypalId: cap?.id || r.body?.id, debugId: r.debugId, approvedBy: 'coordinator', ok: completed });

  if (!completed) {
    if (DEFINITE_DECLINE(r)) {
      await release(); await unlock();
      await sql("UPDATE cover SET status='FAILED', debug_id=$2, error=$3 WHERE id=$1", [coverId, r.debugId, JSON.stringify(r.body?.details || r.body?.name || r.status)]);
      return fail("The sponsor's PayPal account declined. Match this request to another pledge.", 'NEEDS_SPONSOR');
    }
    // Unknown outcome: keep the reservation and the lock; reconcileCovers() replays the same request id.
    await sql("UPDATE cover SET status='CHARGE_UNKNOWN', debug_id=$2, error=$3 WHERE id=$1", [coverId, r.debugId, JSON.stringify(r.body?.name || r.status)]);
    await sql("UPDATE invoice SET cover_lock=now() + interval '1 day' WHERE id=$1", [inv0.id]);
    return fail('PayPal did not confirm the charge. It will be checked automatically; nothing will be charged twice.', 'CHARGE_UNKNOWN');
  }
  await sql("UPDATE cover SET status='CHARGED', paypal_order_id=$2, capture_id=$3, debug_id=$4 WHERE id=$1", [coverId, r.body.id, cap.id, r.debugId]);
  await sql("UPDATE pledge SET status=CASE WHEN used_cents >= cap_cents THEN 'EXHAUSTED' ELSE status END WHERE id=$1", [p.id]);
  await sql("UPDATE help_request SET status='COVERED', updated_at=now(), fallback=NULL WHERE id=$1", [req.id]);
  const recorded = await recordCover(coverId);
  return { ok: true, message: recorded === 'RECORDED' ? 'Covered and recorded' : recorded === 'REFUNDED' ? 'The family paid at the same moment, so the sponsor was refunded' : 'Charged; recording on the invoice will retry', captureId: cap.id };
}

// Records a charged cover on the family's invoice. Never charges. If the invoice was paid by someone else meanwhile, refunds the sponsor.
export async function recordCover(coverId: string): Promise<'RECORDED' | 'REFUNDED' | 'PENDING'> {
  const c = await one('SELECT * FROM cover WHERE id=$1', [coverId]);
  const reqId = unseal(c.sealed_request);
  const req = await one('SELECT * FROM help_request WHERE id=$1', [reqId]);
  const familyId = req ? unseal(req.sealed_family) : null;
  const inv = familyId ? await one('SELECT * FROM invoice WHERE family_id=$1', [familyId]) : null;
  if (!inv) return 'PENDING';
  for (let i = 0; i < 3; i++) {
    let state;
    try { state = await getInvoice(inv.paypal_invoice_id); } catch { await new Promise((s) => setTimeout(s, 1000)); continue; }
    if (state.dueCents < c.amount_cents) {
      // Paid by the family (or the office) in the meantime: return the sponsor's money.
      const rf = await refundCapture(c.capture_id, c.id);
      await ptrace({ scope: `req:${reqId}`, actor: 'system', tool: 'refund_capture', via: 'REST', summary: rf.ok ? 'Invoice was already paid, so the sponsor was refunded in full' : `Refund failed (${rf.status}), needs the treasurer`, paypalId: rf.body?.id, debugId: rf.debugId, ok: rf.ok });
      if (rf.ok) {
        await sql("UPDATE cover SET status='REFUNDED' WHERE id=$1", [c.id]);
        await sql("UPDATE pledge SET used_cents=GREATEST(0, used_cents-$2), status=CASE WHEN status='EXHAUSTED' THEN 'ACTIVE' ELSE status END WHERE id=$1", [c.pledge_id, c.amount_cents]);
        await sql("UPDATE help_request SET status='ANSWERED', reply_text=COALESCE(reply_text,'This contribution is already paid.'), updated_at=now() WHERE id=$1", [reqId]);
        await sql('UPDATE invoice SET cover_lock=NULL WHERE id=$1', [inv.id]);
        return 'REFUNDED';
      }
      return 'PENDING';
    }
    try {
      await recordPayment(`req:${reqId}`, inv.paypal_invoice_id, c.amount_cents, c.public_ref, 'system', 'coordinator', `eg-rec-${c.id}`);
      await sql("UPDATE cover SET recorded=true, status='RECORDED' WHERE id=$1", [c.id]);
      await sql('UPDATE invoice SET cover_lock=NULL WHERE id=$1', [inv.id]);
      await syncInvoice(inv, true);
      return 'RECORDED';
    } catch { await new Promise((s) => setTimeout(s, 1500)); }
  }
  // Keep the invoice locked until this cover is recorded, so no second cover can start.
  await sql("UPDATE invoice SET cover_lock=now() + interval '1 day' WHERE id=$1", [inv.id]);
  return 'PENDING';
}

// Background repair: record charged covers, and resolve unknown charges by replaying the same PayPal request id.
export async function reconcileCovers() {
  for (const c of await sql("SELECT id FROM cover WHERE status='CHARGED' AND recorded=false")) await recordCover(c.id).catch(() => {});
  for (const c of await sql("SELECT c.*, p.vault_id FROM cover c JOIN pledge p ON p.id=c.pledge_id WHERE c.status='CHARGE_UNKNOWN'")) {
    const r = await chargeWithReplay(c.id, c.public_ref, c.vault_id, c.amount_cents);
    const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
    const reqId = unseal(c.sealed_request);
    if (r.ok && r.body?.status === 'COMPLETED' && cap) {
      await sql("UPDATE cover SET status='CHARGED', paypal_order_id=$2, capture_id=$3 WHERE id=$1", [c.id, r.body.id, cap.id]);
      await sql("UPDATE help_request SET status='COVERED', fallback=NULL, updated_at=now() WHERE id=$1", [reqId]);
      await recordCover(c.id).catch(() => {});
    } else if (DEFINITE_DECLINE(r)) {
      await sql("UPDATE cover SET status='FAILED' WHERE id=$1", [c.id]);
      await sql("UPDATE pledge SET used_cents=GREATEST(0, used_cents-$2) WHERE id=$1", [c.pledge_id, c.amount_cents]);
      await sql("UPDATE help_request SET status='NEEDS_SPONSOR', fallback='The charge did not go through. Match to another pledge.' WHERE id=$1", [reqId]);
      const req = await one('SELECT sealed_family FROM help_request WHERE id=$1', [reqId]);
      if (req) await sql('UPDATE invoice SET cover_lock=NULL WHERE family_id=$1', [unseal(req.sealed_family)]);
    }
  }
}
export const retryUnrecorded = reconcileCovers;

// ---------- settlement (PRD 3.6) ----------
export async function settle(): Promise<any> {
  // Retry an earlier settlement whose Payout result was unclear, with the same sender_batch_id (PayPal refuses duplicates).
  const stuck = await one("SELECT * FROM settlement WHERE status='UNCLEAR' ORDER BY created_at LIMIT 1");
  const id = stuck?.id || newId('set');
  if (!stuck) {
    await sql("INSERT INTO settlement (id, total_cents, cover_count, status) VALUES ($1,0,0,'CLAIMING')", [id]);
    // Atomic claim: two settle() calls can never take the same covers.
    const claimed = await sql("UPDATE cover SET settlement_id=$1 WHERE settlement_id IS NULL AND seeded=false AND status IN ('CHARGED','RECORDED') RETURNING amount_cents", [id]);
    if (!claimed.length) { await sql('DELETE FROM settlement WHERE id=$1', [id]); return { ok: false, message: 'No unsettled covers' }; }
    await sql("UPDATE settlement SET total_cents=$2, cover_count=$3, status='PENDING' WHERE id=$1", [id, claimed.reduce((a, c) => a + c.amount_cents, 0), claimed.length]);
  }
  const st = await one('SELECT * FROM settlement WHERE id=$1', [id]);
  const r = await settlementPayout(id, st.total_cents, st.cover_count);
  const batch = r.body?.batch_header?.payout_batch_id;
  const status = r.ok ? r.body?.batch_header?.batch_status || 'PENDING' : r.status >= 400 && r.status < 500 ? 'FAILED' : 'UNCLEAR';
  await sql('UPDATE settlement SET batch_id=COALESCE($2, batch_id), status=$3, debug_id=$4 WHERE id=$1', [id, batch || null, status, r.debugId]);
  await ptrace({ scope: 'treasurer', actor: 'coordinator', tool: 'create_payout', via: 'REST', summary: `${st.cover_count} covers = ${usd(st.total_cents)}, one aggregated Payout item to the Trips account (${status})`, paypalId: batch, debugId: r.debugId, approvedBy: 'treasurer', ok: r.ok });
  if (status === 'FAILED') { await sql('UPDATE cover SET settlement_id=NULL WHERE settlement_id=$1', [id]); return { ok: false, message: `Payout refused by PayPal (${r.status}, debug ${r.debugId})` }; }
  if (status === 'UNCLEAR') return { ok: false, message: 'PayPal did not confirm the Payout. Press Settle again to retry safely with the same batch id.' };
  return { ok: true, id, batch };
}
const gs = globalThis as unknown as { __egSet?: number };
export async function refreshSettlements() {
  if (gs.__egSet && Date.now() - gs.__egSet < 15000) return;
  gs.__egSet = Date.now();
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

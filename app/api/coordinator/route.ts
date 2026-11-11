import { json, wrap, limited } from '@/lib/api';
import { coordinatorView, traceView } from '@/lib/views';
import { one, sql } from '@/lib/db';
import { mintApproval } from '@/lib/approval';
import { performCover, retryUnrecorded, pledgesFor } from '@/lib/ledger/service';
import { pledgeProblems } from '@/lib/ledger/rules';
import { sponsorAsk } from '@/lib/agent/small';

export const dynamic = 'force-dynamic';

export const GET = wrap(async (req: Request) => {
  const sel = new URL(req.url).searchParams.get('request');
  const v = await coordinatorView();
  let trace = null;
  if (sel) {
    const r = await one('SELECT run_id FROM help_request WHERE id=$1', [sel]);
    trace = await traceView(`req:${sel}`, r?.run_id);
  }
  return json({ ...v, trace });
});

// The coordinator's click is the approval: a signed single use token is minted and spent on the money path.
export const POST = wrap(async (req: Request) => {
  const lim = limited(req, 'coord', 10); if (lim) return lim;
  const { action, requestId, override } = await req.json();
  if (action === 'approve') {
    const r = await one("SELECT * FROM help_request WHERE id=$1 AND status='PROPOSED'", [requestId]);
    if (!r) return json({ error: 'Not waiting for approval' }, 409);
    const token = await mintApproval(r.id, r.amount_cents, r.pledge_id);
    const out = await performCover(token, override === true);
    retryUnrecorded().catch(() => {});
    return json(out, out.ok ? 200 : 409);
  }
  if (action === 'decline') {
    await sql("UPDATE help_request SET status='DECLINED', updated_at=now() WHERE id=$1 AND status IN ('PROPOSED','NEEDS_STAFF','NEEDS_SPONSOR')", [requestId]);
    return json({ ok: true });
  }
  if (action === 'rematch') {
    const r = await one("SELECT h.*, c.kind FROM help_request h JOIN collection c ON c.id=h.collection_id WHERE h.id=$1 AND h.status='NEEDS_SPONSOR'", [requestId]);
    if (!r) return json({ error: 'Not waiting for a sponsor' }, 409);
    const p = (await pledgesFor(r.kind)).find((x) => !pledgeProblems(x, r.kind, r.amount_cents).length);
    if (!p) return json({ error: 'Still no pledge that fits. Draft a sponsor ask below.' }, 409);
    await sql("UPDATE help_request SET status='PROPOSED', pledge_id=$2, updated_at=now() WHERE id=$1", [r.id, p.id]);
    return json({ ok: true, message: 'Matched to a pledge. Approve to pay.' });
  }
  if (action === 'done') {
    await sql("UPDATE help_request SET status='ANSWERED', updated_at=now() WHERE id=$1 AND status='NEEDS_STAFF'", [requestId]);
    return json({ ok: true });
  }
  if (action === 'ask') {
    const left = await one("SELECT COALESCE(sum(cap_cents - used_cents),0)::int AS left FROM pledge WHERE status='ACTIVE'");
    const open = await one("SELECT COALESCE(sum(amount_cents),0)::int AS open FROM help_request WHERE status IN ('PROPOSED','NEW')");
    const covered = await one("SELECT count(*)::int AS n FROM cover WHERE status IN ('CHARGED','RECORDED')");
    const unpaid = await one("SELECT count(*)::int AS n FROM invoice WHERE status NOT IN ('PAID','MARKED_AS_PAID','CANCELLED')");
    // Forecast: open requests plus the past rate of covers among families (code), rounded up to a $45 multiple.
    const rate = covered.n ? covered.n / 24 : 0.1;
    const need = Math.max(0, open.open + Math.ceil(unpaid.n * rate) * 4500 - left.left);
    const ask = await sponsorAsk(Math.max(need, 4500), left.left, covered.n);
    return json({ ...ask, leftCents: left.left, needCents: need });
  }
  return json({ error: 'Unknown action' }, 400);
});

import { json, wrap, limited } from '@/lib/api';
import { sql, one, newId } from '@/lib/db';
import { parsePledge } from '@/lib/agent/small';
import { createSetupToken, exchangeSetupToken, deletePaymentToken } from '@/lib/paypal/coverfund';
import { ptrace } from '@/lib/trace';
import { sponsorView } from '@/lib/views';
import { dailyCount, LIMITS } from '@/lib/ledger/abuse';
import crypto from 'node:crypto';
import { isAdmin } from '@/lib/api';

function isOwner(req: Request, p: any): boolean {
  if (!p?.owner_hash) return false;
  const c = (req.headers.get('cookie') || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`eg_pledge_${p.id}=`));
  const v = c?.split('=')[1];
  return !!v && crypto.createHash('sha256').update(v).digest('hex') === p.owner_hash;
}

export const dynamic = 'force-dynamic';

export const GET = wrap(async (req: Request) => {
  const id = new URL(req.url).searchParams.get('pledge');
  if (id) {
    const v = await sponsorView(id);
    if (!v) return json({ error: 'Not found' }, 404);
    const p = await one('SELECT id, owner_hash FROM pledge WHERE id=$1', [id]);
    const owner = isOwner(req, p) || isAdmin(req);
    // Others see the impact, not the receipts.
    return json({ ...v, owner, covers: owner ? v.covers : v.covers.map((c: any) => ({ ...c, captureId: null })) });
  }
  const list = await sql("SELECT p.id, s.display_name, p.status FROM pledge p JOIN sponsor s ON s.id=p.sponsor_id WHERE p.status IN ('ACTIVE','EXHAUSTED','STOPPED') ORDER BY p.created_at");
  return json({ pledges: list });
});

// action: read (AI reads plain words) | start (setup token + PayPal approval link) | finish (swap for saved account) | stop
export const POST = wrap(async (req: Request) => {
  const lim = limited(req, 'sponsor', 10); if (lim) return lim;
  const b = await req.json();
  if (b.action === 'read') {
    const text = String(b.text || '').slice(0, 400);
    return json(await parsePledge(text));
  }
  if (b.action === 'start') {
    if ((await dailyCount('pledge')) >= LIMITS.pledgesPerDay) return json({ error: 'The demo has reached its daily limit for new pledges. Try again tomorrow.' }, 429);
    const name = String(b.name || "Rosa's Bakery").replace(/[^\p{L}\p{N} &'.,-]/gu, '').trim().slice(0, 60) || 'Local business';
    const t = b.terms || {};
    const tags = (Array.isArray(t.tags) ? t.tags : ['any']).filter((x: string) => ['any', 'sports_only', 'trips_only'].includes(x));
    const restated = String(t.restated || '').slice(0, 400);
    if (!(t.cap_cents > 0 && t.cap_cents <= 100000 && t.per_child_cap_cents > 0)) return json({ error: 'Pledge needs a total cap up to $1,000 and a per child cap' }, 400);
    const sid = newId('spn'), pid = newId('plg');
    await sql('INSERT INTO sponsor (id, display_name) VALUES ($1,$2)', [sid, name]);
    await sql('INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, conditions_text, conditions_tags) VALUES ($1,$2,$3,$4,$5,$6)',
      [pid, sid, Math.round(t.cap_cents), Math.round(Math.min(t.per_child_cap_cents, t.cap_cents)), restated, (tags.length ? tags : ['any']).join(',')]);
    const owner = crypto.randomBytes(24).toString('base64url');
    await sql('UPDATE pledge SET owner_hash=$2 WHERE id=$1', [pid, crypto.createHash('sha256').update(owner).digest('hex')]);
    const r = await createSetupToken(pid);
    await ptrace({ scope: `pledge:${pid}`, actor: 'sponsor', tool: 'create_setup_token', via: 'REST', summary: r.ok ? 'Save PayPal account, no purchase (Vault v3, MERCHANT)' : `Failed ${r.status}`, paypalId: r.body?.id, debugId: r.debugId, ok: r.ok });
    if (!r.ok) return json({ error: `PayPal setup token failed (${r.status}, debug ${r.debugId})` }, 502);
    await sql('UPDATE pledge SET setup_token=$2 WHERE id=$1', [pid, r.body.id]);
    const res = json({ pledgeId: pid, approveUrl: r.body.links?.find((l: any) => l.rel === 'approve')?.href });
    res.headers.append('Set-Cookie', `eg_pledge_${pid}=${owner}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return res;
  }
  if (b.action === 'finish') {
    const p = await one('SELECT * FROM pledge WHERE id=$1', [b.pledgeId]);
    if (!p?.setup_token) return json({ error: 'Unknown pledge' }, 404);
    if (p.vault_id) return json({ ok: true, pledgeId: p.id });
    // Only a new pledge, from the browser that made it, can be finished. A stopped pledge can never come back to life.
    if (p.status !== 'PENDING') return json({ error: 'This pledge is not waiting to be saved.' }, 409);
    if (!isOwner(req, p) && !isAdmin(req)) return json({ error: 'Finish saving from the browser you started in.' }, 403);
    const r = await exchangeSetupToken(p.setup_token);
    await ptrace({ scope: `pledge:${p.id}`, actor: 'sponsor', tool: 'create_payment_token', via: 'REST', summary: r.ok ? 'PayPal account saved. Nothing charged.' : `Failed ${r.status}`, paypalId: r.body?.customer?.id, debugId: r.debugId, ok: r.ok });
    if (!r.ok) return json({ error: `PayPal did not save the account (${r.status}, debug ${r.debugId}). Did you approve on PayPal?` }, 502);
    await sql("UPDATE pledge SET vault_id=$2, customer_id=$3, status='ACTIVE', setup_token=NULL WHERE id=$1 AND status='PENDING'", [p.id, r.body.id, r.body.customer?.id || null]);
    await sql('UPDATE sponsor SET paypal_email=$2 WHERE id=$1', [p.sponsor_id, r.body.payment_source?.paypal?.email_address || null]);
    return json({ ok: true, pledgeId: p.id });
  }
  if (b.action === 'stop') {
    const p = await one('SELECT * FROM pledge WHERE id=$1', [b.pledgeId]);
    if (!p) return json({ error: 'Unknown pledge' }, 404);
    if (!isOwner(req, p) && !isAdmin(req)) return json({ error: 'Only the sponsor who made this pledge can stop it, from the browser they used.' }, 403);
    if (p.vault_id) {
      const r = await deletePaymentToken(p.vault_id);
      if (!r.ok && r.status !== 404) return json({ error: `PayPal could not remove the saved account yet (${r.status}). Nothing will be charged; please try again.` }, 502);
      await ptrace({ scope: `pledge:${p.id}`, actor: 'sponsor', tool: 'delete_payment_token', via: 'REST', summary: `Saved PayPal account deleted (${r.status})`, debugId: r.debugId, ok: r.ok || r.status === 404 });
    }
    await sql("UPDATE pledge SET status='STOPPED', vault_id=NULL WHERE id=$1", [p.id]);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
});

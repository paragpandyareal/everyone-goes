import { json, wrap, limited } from '@/lib/api';
import { sql, one, newId } from '@/lib/db';
import { parsePledge } from '@/lib/agent/small';
import { createSetupToken, exchangeSetupToken, deletePaymentToken } from '@/lib/paypal/coverfund';
import { ptrace } from '@/lib/trace';
import { sponsorView } from '@/lib/views';

export const dynamic = 'force-dynamic';

export const GET = wrap(async (req: Request) => {
  const id = new URL(req.url).searchParams.get('pledge');
  if (id) { const v = await sponsorView(id); return v ? json(v) : json({ error: 'Not found' }, 404); }
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
    const name = String(b.name || "Rosa's Bakery").slice(0, 60);
    const t = b.terms || {};
    if (!(t.cap_cents > 0 && t.cap_cents <= 100000 && t.per_child_cap_cents > 0)) return json({ error: 'Pledge needs a total cap up to $1,000 and a per child cap' }, 400);
    const sid = newId('spn'), pid = newId('plg');
    await sql('INSERT INTO sponsor (id, display_name) VALUES ($1,$2)', [sid, name]);
    await sql('INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, conditions_text, conditions_tags) VALUES ($1,$2,$3,$4,$5,$6)',
      [pid, sid, t.cap_cents, Math.min(t.per_child_cap_cents, t.cap_cents), String(t.restated || ''), (t.tags || ['any']).join(',')]);
    const r = await createSetupToken(pid);
    await ptrace({ scope: `pledge:${pid}`, actor: 'sponsor', tool: 'create_setup_token', via: 'REST', summary: r.ok ? 'Save PayPal account, no purchase (Vault v3, MERCHANT)' : `Failed ${r.status}`, paypalId: r.body?.id, debugId: r.debugId, ok: r.ok });
    if (!r.ok) return json({ error: `PayPal setup token failed (${r.status}, debug ${r.debugId})` }, 502);
    await sql('UPDATE pledge SET setup_token=$2 WHERE id=$1', [pid, r.body.id]);
    return json({ pledgeId: pid, approveUrl: r.body.links?.find((l: any) => l.rel === 'approve')?.href });
  }
  if (b.action === 'finish') {
    const p = await one('SELECT * FROM pledge WHERE id=$1', [b.pledgeId]);
    if (!p?.setup_token) return json({ error: 'Unknown pledge' }, 404);
    if (p.vault_id) return json({ ok: true, pledgeId: p.id });
    const r = await exchangeSetupToken(p.setup_token);
    await ptrace({ scope: `pledge:${p.id}`, actor: 'sponsor', tool: 'create_payment_token', via: 'REST', summary: r.ok ? 'PayPal account saved. Nothing charged.' : `Failed ${r.status}`, paypalId: r.body?.customer?.id, debugId: r.debugId, ok: r.ok });
    if (!r.ok) return json({ error: `PayPal did not save the account (${r.status}, debug ${r.debugId}). Did you approve on PayPal?` }, 502);
    await sql("UPDATE pledge SET vault_id=$2, customer_id=$3, status='ACTIVE' WHERE id=$1", [p.id, r.body.id, r.body.customer?.id || null]);
    await sql('UPDATE sponsor SET paypal_email=$2 WHERE id=$1', [p.sponsor_id, r.body.payment_source?.paypal?.email_address || null]);
    return json({ ok: true, pledgeId: p.id });
  }
  if (b.action === 'stop') {
    const p = await one('SELECT * FROM pledge WHERE id=$1', [b.pledgeId]);
    if (!p) return json({ error: 'Unknown pledge' }, 404);
    if (p.vault_id) {
      const r = await deletePaymentToken(p.vault_id);
      await ptrace({ scope: `pledge:${p.id}`, actor: 'sponsor', tool: 'delete_payment_token', via: 'REST', summary: `Saved PayPal account deleted (${r.status})`, debugId: r.debugId, ok: r.ok || r.status === 404 });
    }
    await sql("UPDATE pledge SET status='STOPPED', vault_id=NULL WHERE id=$1", [p.id]);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
});

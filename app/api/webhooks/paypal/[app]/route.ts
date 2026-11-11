// PRD 6.6. Raw body read as text first, verified with PayPal, stored by event ID, repeats ignored.
import { json } from '@/lib/api';
import { sql, one, newId } from '@/lib/db';
import { verifyWebhook } from '@/lib/paypal/webhooks';
import { syncInvoice, refreshSettlements } from '@/lib/ledger/service';
import { ptrace, shortId } from '@/lib/trace';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ app: string }> };

export async function POST(req: Request, { params }: P) {
  const app = (await params).app;
  if (app !== 'trips' && app !== 'coverfund') return json({ error: 'unknown app' }, 404);
  const raw = await req.text();
  let ev: any;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  const { verified } = await verifyWebhook(app, req.headers, raw);
  if (!verified) return json({ error: 'not verified' }, 400);
  const resourceId = ev.resource?.invoice?.id || ev.resource?.id || ev.resource?.batch_header?.payout_batch_id || null;
  const inserted = await one('INSERT INTO webhook_event (id, app, event_id, type, verified, resource_id) VALUES ($1,$2,$3,$4,true,$5) ON CONFLICT (event_id) DO NOTHING RETURNING id', [newId('wh'), app, ev.id, ev.event_type, resourceId]);
  if (!inserted) return json({ ok: true, repeat: true });

  if (app === 'trips' && /^INVOICING\.INVOICE\./.test(ev.event_type)) {
    const invId = ev.resource?.invoice?.id || ev.resource?.id;
    const inv = await one('SELECT i.*, f.collection_id FROM invoice i JOIN family f ON f.id=i.family_id WHERE i.paypal_invoice_id=$1', [invId]);
    if (inv) {
      await syncInvoice(inv, true);
      await ptrace({ scope: `col:${inv.collection_id}`, actor: 'webhook', tool: ev.event_type, via: 'Webhook', summary: 'Verified PayPal webhook, row updated', paypalId: shortId(invId) });
    }
  }
  if (app === 'coverfund' && /PAYOUTS/.test(ev.event_type)) await refreshSettlements();
  return json({ ok: true });
}

// Seeding steps (admin only) and the public demo reset (once per minute).
import { json, wrap, isAdmin, limited } from '@/lib/api';
import { seedClass, seedSponsorStart, seedCovers, seedOffice, seedMessages, parentLinks, resetDemo } from '@/lib/ledger/seed';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = wrap(async (req: Request) => {
  if (!isAdmin(req)) return json({ error: 'admin only' }, 403);
  return json({ parents: await parentLinks().catch(() => []) });
});

export const POST = wrap(async (req: Request) => {
  const { step, keepSponsors } = await req.json();
  if (step === 'reset') {
    const lim = limited(req, 'reset', 2); if (lim) return lim;
    return json(await resetDemo({ keepSponsors: !(keepSponsors === false && isAdmin(req)) }));
  }
  // Layout checks only: fake rows, no PayPal. Refuses to run once a Trips app is configured, so it can never mix with real data.
  if (step === 'uifake') {
    if (process.env.ALLOW_UI_FAKE !== '1' || (await import('@/lib/paypal/client')).hasApp('trips')) return json({ error: 'not allowed' }, 403);
    const { seedClass } = await import('@/lib/ledger/seed');
    const { sql } = await import('@/lib/db');
    const r = await seedClass();
    await sql("UPDATE invoice SET status = CASE WHEN random() < 0.7 THEN 'PAID' ELSE 'SENT' END, paid_cents = 4500 WHERE paypal_invoice_id IS NULL");
    await sql("UPDATE invoice SET paid_cents = 0 WHERE status='SENT'");
    return json({ ...r, fake: true });
  }
  if (!isAdmin(req)) return json({ error: 'admin only' }, 403);
  if (step === 'class') return json(await seedClass());
  if (step === 'corner') return json(await seedSponsorStart('Corner Hardware', 15000, 4500, 'Up to $150 this term, at most $45 per child.'));
  if (step === 'covers') return json(await seedCovers());
  if (step === 'office') return json(await seedOffice());
  if (step === 'messages') return json(await seedMessages());
  if (step === 'eval') return json(await (await import('@/lib/agent/eval')).runEval());
  return json({ error: 'unknown step' }, 400);
});

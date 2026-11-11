import { json, wrap, limited } from '@/lib/api';
import { draftCollection, type Draft } from '@/lib/agent/small';
import { createCollection, issueInvoices, ROOM12, SOCCER } from '@/lib/ledger/collections';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST {sentence} -> AI draft (teacher confirms). POST {confirm: draft, sentence, roster} -> creates and issues PayPal invoices.
export const POST = wrap(async (req: Request) => {
  const body = await req.json();
  if (body.confirm) {
    const lim = limited(req, 'collect', 3); if (lim) return lim;
    const d = body.confirm as Draft;
    if (!(d.amount_cents > 0 && d.amount_cents <= 50000)) return json({ error: 'Amount must be between $0.01 and $500' }, 400);
    const roster = body.roster === 'soccer' ? SOCCER : ROOM12;
    const id = await createCollection(d, String(body.sentence || ''), roster);
    await sql("INSERT INTO kv (k, v) VALUES ('active_collection', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [id]);
    issueInvoices(id).catch((e) => console.error('issueInvoices', e));
    return json({ id });
  }
  const lim = limited(req, 'draft', 6); if (lim) return lim;
  const sentence = String(body.sentence || '').slice(0, 400);
  if (sentence.length < 5) return json({ error: 'Type one sentence, for example "Museum trip, Friday, $45 requested contribution"' }, 400);
  return json(await draftCollection(sentence));
});

export const PUT = wrap(async (req: Request) => {
  const { id } = await req.json();
  await sql("INSERT INTO kv (k, v) VALUES ('active_collection', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [id]);
  return json({ ok: true });
});

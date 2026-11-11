import { json, wrap, limited, requireStaff } from '@/lib/api';
import { draftCollection, type Draft } from '@/lib/agent/small';
import { createCollection, issueInvoices, ROOM12, SOCCER } from '@/lib/ledger/collections';
import { sql, one } from '@/lib/db';
import { dailyCount, LIMITS } from '@/lib/ledger/abuse';

export const dynamic = 'force-dynamic';

// POST {sentence} -> AI draft (teacher confirms). POST {confirm: draft, sentence, roster} -> creates and issues PayPal invoices.
export const POST = wrap(async (req: Request) => {
  { const gate = requireStaff(req); if (gate) return gate; }
  const body = await req.json();
  if (body.confirm) {
    const lim = limited(req, 'collect', 3); if (lim) return lim;
    if ((await dailyCount('collection')) >= LIMITS.collectionsPerDay) return json({ error: `The demo allows ${LIMITS.collectionsPerDay} new collections a day. Try the seeded ones.` }, 429);
    // Use the draft the server produced (by run id), never a client-supplied one.
    const run = await one("SELECT output_json FROM agent_run WHERE id=$1 AND kind='COLLECTION'", [String(body.runId || '')]);
    if (!run?.output_json) return json({ error: 'Draft not found. Draft it again.' }, 400);
    const d = run.output_json as Draft;
    if (!['TRIP', 'CLUB_FEE'].includes(d.kind)) return json({ error: 'Unknown collection type' }, 400);
    d.title = String(d.title || 'Collection').slice(0, 80);
    d.item_name = String(d.item_name || `Requested contribution, ${d.title}`).slice(0, 120);
    if (!(Number.isInteger(d.amount_cents) && d.amount_cents > 0 && d.amount_cents <= 50000)) return json({ error: 'Amount must be between $0.01 and $500' }, 400);
    const roster = body.roster === 'soccer' ? SOCCER : ROOM12;
    const id = await createCollection(d, String(body.sentence || '').slice(0, 400), roster);
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
  { const gate = requireStaff(req); if (gate) return gate; }
  const { id } = await req.json();
  if (!(await one('SELECT id FROM collection WHERE id=$1', [String(id)]))) return json({ error: 'Unknown collection' }, 404);
  await sql("INSERT INTO kv (k, v) VALUES ('active_collection', $1) ON CONFLICT (k) DO UPDATE SET v=$1", [id]);
  return json({ ok: true });
});

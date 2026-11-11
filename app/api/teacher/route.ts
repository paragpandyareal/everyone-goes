import { json, wrap, requireStaff } from '@/lib/api';
import { teacherView } from '@/lib/views';
import { activeCollectionId } from '@/lib/ledger/collections';
import { traceView } from '@/lib/views';

export const dynamic = 'force-dynamic';
export const GET = wrap(async (req: Request) => {
  const gate = requireStaff(req); if (gate) return gate; // names and paid status are staff-only outside the demo
  const id = new URL(req.url).searchParams.get('collection') || (await activeCollectionId());
  if (!id) return json({ empty: true });
  const v = await teacherView(id);
  const trace = await traceView(`col:${id}`);
  // Webhook rows are left out: they appear only when a parent pays on PayPal, so they would show how a row was paid.
  return json({ ...v, trace: trace.rows.filter((r: any) => r.via !== 'Webhook').slice(-12) });
});

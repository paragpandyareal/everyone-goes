import { json, wrap } from '@/lib/api';
import { teacherView } from '@/lib/views';
import { activeCollectionId } from '@/lib/ledger/collections';
import { traceView } from '@/lib/views';

export const dynamic = 'force-dynamic';
export const GET = wrap(async (req: Request) => {
  const id = new URL(req.url).searchParams.get('collection') || (await activeCollectionId());
  if (!id) return json({ empty: true });
  const v = await teacherView(id);
  const trace = await traceView(`col:${id}`);
  return json({ ...v, trace: trace.rows.slice(-12) });
});

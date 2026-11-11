import { json, wrap, limited, requireStaff } from '@/lib/api';
import { treasurerView, traceView } from '@/lib/views';
import { settle, refreshSettlements } from '@/lib/ledger/service';

export const dynamic = 'force-dynamic';
export const GET = wrap(async (req: Request) => {
  const gate = requireStaff(req); if (gate) return gate;
  await refreshSettlements().catch(() => {});
  return json({ ...(await treasurerView()), trace: (await traceView('treasurer')).rows.slice(-8) });
});
export const POST = wrap(async (req: Request) => {
  const gate = requireStaff(req); if (gate) return gate;
  const lim = limited(req, 'settle', 3); if (lim) return lim;
  return json(await settle());
});

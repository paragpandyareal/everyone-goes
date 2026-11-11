import { json, wrap, limited } from '@/lib/api';
import { parentView } from '@/lib/views';
import { newHelpRequest } from '@/lib/ledger/collections';
import { triage } from '@/lib/agent/triage';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ token: string }> };

export const GET = wrap(async (_req: Request, { params }: P) => {
  const v = await parentView((await params).token);
  return v ? json(v) : json({ error: 'This link is not valid' }, 404);
});

export const POST = wrap(async (req: Request, { params }: P) => {
  const lim = limited(req, 'help', 5); if (lim) return lim;
  const { token } = await params;
  const text = String((await req.json()).text || '').trim();
  if (text.length < 2) return json({ error: 'Write a short message' }, 400);
  const id = await newHelpRequest(token, text);
  triage(id).catch((e) => console.error('triage', e));
  return json({ id });
});

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
    return json(await resetDemo({ keepSponsors: !!keepSponsors }));
  }
  if (!isAdmin(req)) return json({ error: 'admin only' }, 403);
  if (step === 'class') return json(await seedClass());
  if (step === 'corner') return json(await seedSponsorStart('Corner Hardware', 15000, 4500, 'Up to $150 this term, at most $45 per child.'));
  if (step === 'covers') return json(await seedCovers());
  if (step === 'office') return json(await seedOffice());
  if (step === 'messages') return json(await seedMessages());
  return json({ error: 'unknown step' }, 400);
});

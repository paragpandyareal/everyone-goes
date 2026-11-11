// Judge mode shortcuts: which demo family links to open. Demo convenience only; a real parent only ever has their own link.
import { json, wrap } from '@/lib/api';
import { one, sql } from '@/lib/db';
import { HERO_INDEX } from '@/lib/ledger/collections';

export const dynamic = 'force-dynamic';
export const GET = wrap(async () => {
  if (process.env.DEMO_MODE === '0') return json({ seeded: false });
  const trip = await one("SELECT v FROM kv WHERE k='trip_collection'");
  if (!trip) return json({ seeded: false });
  const fams = await sql('SELECT f.sort, f.help_token, f.child_first, f.code, i.status FROM family f JOIN invoice i ON i.family_id=f.id WHERE f.collection_id=$1 ORDER BY f.sort', [trip.v]);
  const hero = fams.find((f) => f.sort === HERO_INDEX);
  const payer = fams.find((f) => f.sort === 2);
  const pledges = await sql("SELECT p.id, s.display_name, p.status, p.seeded FROM pledge p JOIN sponsor s ON s.id=p.sponsor_id WHERE p.status IN ('ACTIVE','EXHAUSTED') ORDER BY p.created_at");
  return json({ seeded: true, hero: hero && { token: hero.help_token, child: hero.child_first, status: hero.status }, payer: payer && { token: payer.help_token, child: payer.child_first, status: payer.status }, pledges });
});

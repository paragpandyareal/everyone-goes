// Staff sign in for coordinator, treasurer and school lead pages (production). In DEMO_MODE=1 these pages are open for judges.
import crypto from 'node:crypto';
import { json, wrap, limited, demoMode, staffSessionValue } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const GET = wrap(async () => json({ demo: demoMode(), configured: !!process.env.STAFF_PASSCODE }));
export const POST = wrap(async (req: Request) => {
  const lim = limited(req, 'staff', 5); if (lim) return lim;
  const { passcode } = await req.json();
  const want = process.env.STAFF_PASSCODE || '';
  const a = Buffer.from(String(passcode || '')), b = Buffer.from(want);
  if (!want || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json({ error: 'Wrong passcode' }, 401);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', `eg_staff=${staffSessionValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return res;
});

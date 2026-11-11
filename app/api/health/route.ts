import { json } from '@/lib/api';
import { hasApp } from '@/lib/paypal/client';
import { liveMode, MODEL } from '@/lib/agent/claude';

export const dynamic = 'force-dynamic';

// DEMO_LOGINS holds sandbox-only test logins for judges, e.g. [{"role":"Rosa's Bakery (sponsor)","email":"…","password":"…"}].
function demoLogins(): { role: string; email: string; password: string }[] {
  try { return JSON.parse(process.env.DEMO_LOGINS || '[]'); } catch { return []; }
}
export const GET = async () => json({ ok: true, trips: hasApp('trips'), coverfund: hasApp('coverfund'), ai: liveMode() ? MODEL : 'off', demo: process.env.DEMO_MODE !== '0', logins: demoLogins() });

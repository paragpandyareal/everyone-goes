import { json } from '@/lib/api';
import { hasApp } from '@/lib/paypal/client';
import { liveMode, MODEL } from '@/lib/agent/claude';

export const dynamic = 'force-dynamic';
export const GET = async () => json({ ok: true, trips: hasApp('trips'), coverfund: hasApp('coverfund'), ai: liveMode() ? MODEL : 'off' });

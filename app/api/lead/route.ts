import { json, wrap, requireStaff } from '@/lib/api';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
// Safeguarding inbox. Redacted text only, no family code, no payment information.
export const GET = wrap(async (req: Request) => { const gate = requireStaff(req); if (gate) return gate; return json({ items: await sql('SELECT id, text_redacted, created_at FROM lead_item ORDER BY created_at DESC LIMIT 50') }); });

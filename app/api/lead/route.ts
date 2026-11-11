import { json, wrap, requireStaff } from '@/lib/api';
import { sql, one } from '@/lib/db';
import { unseal } from '@/lib/privacy/seal';

export const dynamic = 'force-dynamic';
// Safeguarding inbox. The lead is the one school role that must be able to act on a concern, so each item says which
// child and family it is about. It never shows payment information, and these items never reach the coordinator.
export const GET = wrap(async (req: Request) => {
  const gate = requireStaff(req); if (gate) return gate;
  const items = await sql('SELECT l.id, l.text_redacted, l.created_at, h.sealed_family, c.title FROM lead_item l LEFT JOIN help_request h ON h.id=l.request_id LEFT JOIN collection c ON c.id=h.collection_id ORDER BY l.created_at DESC LIMIT 50');
  const out = [];
  for (const i of items) {
    let family = null;
    try { if (i.sealed_family) { const f = await one('SELECT child_first, parent_name FROM family WHERE id=$1', [unseal(i.sealed_family)]); if (f) family = { child: f.child_first, parent: f.parent_name }; } } catch {}
    out.push({ id: i.id, text_redacted: i.text_redacted, created_at: i.created_at, family, collection: i.title || null });
  }
  return json({ items: out });
});

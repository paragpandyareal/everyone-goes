// Every PayPal call the product makes is written here, so the trace panel can show tool, short args, PayPal ID and who approved it.
import { sql } from './db';

// Claude's reasoning can quote the family's words or name their language, so staff never see it and it is not stored.
export const REASONING_HIDDEN = 'Claude reasoned before acting. Not shown to staff or stored: it can quote the family’s words.';

export type TraceRow = { scope: string; actor: 'agent' | 'system' | 'coordinator' | 'teacher' | 'sponsor' | 'webhook' | 'seed'; tool: string; via: 'Agent Toolkit' | 'REST' | 'Webhook' | 'Code'; summary?: string; paypalId?: string | null; debugId?: string | null; approvedBy?: string | null; ok?: boolean };

export async function ptrace(r: TraceRow) {
  await sql('INSERT INTO ptrace (scope, actor, tool, via, summary, paypal_id, debug_id, approved_by, ok) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [r.scope, r.actor, r.tool, r.via, r.summary || null, r.paypalId || null, r.debugId || null, r.approvedBy || null, r.ok ?? true]);
}

// Invoice IDs are shortened in any view a coordinator can see.
export const shortId = (id?: string | null) => (id ? (id.length > 12 ? `${id.slice(0, 5)}…${id.slice(-4)}` : id) : '');

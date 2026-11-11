// PRD 7.1. One query function per role. Each returns only the fields that role may see.
// Tests in views.test.ts prove the teacher and sponsor views never put a family code next to a cover.
import { sql, one } from './db';
import { unseal } from './privacy/seal';
import { counters, syncCollection, isPaidStatus } from './ledger/service';

const g = globalThis as unknown as { __egSync?: Record<string, number> };

export function teacherStatus(status: string, paid: number): 'Paid' | 'Part paid' | 'Not yet' | 'Issuing' | 'Error' {
  if (isPaidStatus(status)) return 'Paid';
  if (status === 'PARTIALLY_PAID' || paid > 0) return 'Part paid';
  if (status === 'ISSUING' || status === 'DRAFT') return 'Issuing';
  if (status === 'ERROR') return 'Error';
  return 'Not yet';
}

// Teacher: who has paid. Never the family code, never who asked for help, never how a row was paid.
export async function teacherView(collectionId: string) {
  g.__egSync ||= {};
  if (!g.__egSync[collectionId] || Date.now() - g.__egSync[collectionId] > 10_000) {
    g.__egSync[collectionId] = Date.now();
    syncCollection(collectionId).catch(() => {});
  }
  const coll = await one('SELECT id, title, kind, amount_cents, due_date FROM collection WHERE id=$1', [collectionId]);
  const rows = await sql(`SELECT f.child_first, f.parent_name, i.status, i.paid_cents, i.tip_cents, i.pay_url, i.seeded, i.updated_at, f.sort
    FROM family f JOIN invoice i ON i.family_id=f.id WHERE f.collection_id=$1 ORDER BY f.sort`, [collectionId]);
  const collections = await sql(`SELECT c.id, c.title, c.kind, c.amount_cents, count(f.id)::int AS families,
      count(*) FILTER (WHERE i.status IN ('PAID','MARKED_AS_PAID'))::int AS paid
    FROM collection c LEFT JOIN family f ON f.collection_id=c.id LEFT JOIN invoice i ON i.family_id=f.id GROUP BY c.id ORDER BY c.created_at`);
  const qr = await one('SELECT v FROM kv WHERE k=$1', [`qr:${collectionId}`]);
  return {
    collection: coll, collections, qr: qr?.v || null, counters: await counters(collectionId),
    rows: rows.map((r) => ({ child: r.child_first, parent: r.parent_name, status: teacherStatus(r.status, r.paid_cents), paidCents: Math.min(r.paid_cents, coll.amount_cents), tipCents: r.tip_cents, seeded: r.seeded, updatedAt: r.updated_at, payUrl: r.pay_url })),
  };
}

// Coordinator: code, category, summary, amount, pledge balance. Never names, raw text or language.
export async function coordinatorView() {
  const reqs = await sql(`SELECT r.id, r.code, r.category, r.kind_of_help, r.amount_cents, r.summary, r.status, r.confidence, r.fallback, r.scripted, r.created_at, r.updated_at, r.pledge_id, c.title, c.kind
    FROM help_request r JOIN collection c ON c.id=r.collection_id ORDER BY r.created_at DESC LIMIT 60`);
  const pledges = await sql("SELECT p.id, p.cap_cents, p.used_cents, p.per_child_cap_cents, p.conditions_text, p.status, p.seeded FROM pledge p WHERE p.status IN ('ACTIVE','EXHAUSTED') ORDER BY p.created_at");
  const label = (id: string) => `P-${id.slice(-4).toUpperCase()}`;
  return {
    requests: reqs.map((r) => ({ ...r, pledge: r.pledge_id ? label(r.pledge_id) : null, pledge_id: undefined })),
    pledges: pledges.map((p) => ({ label: label(p.id), left_cents: p.cap_cents - p.used_cents, cap_cents: p.cap_cents, per_child_cap_cents: p.per_child_cap_cents, conditions: p.conditions_text || 'none', status: p.status, seeded: p.seeded })),
  };
}

// Sponsor: their own pledge, amounts and capture IDs. No names, codes or classes.
export async function sponsorView(pledgeId: string) {
  const p = await one('SELECT p.*, s.display_name FROM pledge p JOIN sponsor s ON s.id=p.sponsor_id WHERE p.id=$1', [pledgeId]);
  if (!p) return null;
  const covers = await sql("SELECT amount_cents, capture_id, created_at, status FROM cover WHERE pledge_id=$1 AND status IN ('CHARGED','RECORDED') ORDER BY created_at", [pledgeId]);
  return {
    sponsor: p.display_name, status: p.status, capCents: p.cap_cents, perChildCents: p.per_child_cap_cents, usedCents: p.used_cents, conditions: p.conditions_text, seeded: p.seeded, saved: !!p.vault_id,
    covers: covers.map((c) => ({ amountCents: c.amount_cents, captureId: c.capture_id, at: c.created_at })),
    children: covers.length,
  };
}

// Parent: their own invoice and thread only.
export async function parentView(token: string) {
  const f = await one(`SELECT f.id, f.code, f.child_first, c.title, c.amount_cents, c.kind, i.status, i.paid_cents, i.pay_url
    FROM family f JOIN collection c ON c.id=f.collection_id JOIN invoice i ON i.family_id=f.id WHERE f.help_token=$1`, [token]);
  if (!f) return null;
  const reqs = await sql('SELECT id, raw_enc, status, reply_text, reply_en, created_at FROM help_request WHERE help_token=$1 ORDER BY created_at', [token]);
  const showReply = (s: string) => ['COVERED', 'ANSWERED', 'NEEDS_STAFF', 'ROUTED_TO_LEAD'].includes(s);
  return {
    title: f.title, amountCents: f.amount_cents, status: teacherStatus(f.status, f.paid_cents), payUrl: f.pay_url, child: f.child_first,
    thread: reqs.map((r) => ({ id: r.id, text: unseal(r.raw_enc), at: r.created_at, pending: !showReply(r.status), reply: showReply(r.status) ? r.reply_text : null, replyEn: showReply(r.status) ? r.reply_en : null })),
  };
}

export async function treasurerView() {
  const covers = await sql("SELECT public_ref, amount_cents, capture_id, status, settlement_id, seeded, created_at FROM cover WHERE status IN ('CHARGED','RECORDED') ORDER BY created_at DESC");
  const settlements = await sql('SELECT * FROM settlement ORDER BY created_at DESC');
  const unsettled = covers.filter((c) => !c.settlement_id && !c.seeded);
  return { covers, settlements, unsettledCents: unsettled.reduce((a, c) => a + c.amount_cents, 0), unsettledCount: unsettled.length };
}

export async function traceView(scope: string, runId?: string | null) {
  const pay = await sql('SELECT tool, via, summary, paypal_id, debug_id, approved_by, ok, actor, created_at FROM ptrace WHERE scope=$1 ORDER BY id', [scope]);
  const run = runId ? await one('SELECT kind, model, mode, status, trace_json, created_at FROM agent_run WHERE id=$1', [runId]) : null;
  const rows = [
    ...(run?.trace_json || []).map((t: any) => ({ at: t.at, kind: t.type, tool: t.name, via: t.type === 'check' ? 'Code' : 'Claude', summary: t.summary, ok: t.ok !== false })),
    ...pay.map((p) => ({ at: new Date(p.created_at).getTime(), kind: 'paypal', tool: p.tool, via: p.via, summary: p.summary, paypalId: p.paypal_id, debugId: p.debug_id, approvedBy: p.approved_by, ok: p.ok })),
  ].sort((a, b) => a.at - b.at);
  return { rows, model: run?.model || null, mode: run?.mode || null, status: run?.status || null };
}

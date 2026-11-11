'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePoll, post, usd, Chip, TracePanel, Notice, timeAgo } from '@/components/ui';

const CAT_TONE: Record<string, string> = { HARDSHIP: 'coral', PARTIAL: 'sun', TIMING: 'sky', QUESTION: 'sky', NOT_ATTENDING: 'grey', SAFEGUARDING: 'ink', OTHER: 'grey' };
const STATUS: Record<string, [string, string]> = {
  NEW: ['Reading…', 'grey'], NEEDS_SPONSOR: ['Waiting for a sponsor', 'sun'], CHARGE_UNKNOWN: ['Checking with PayPal', 'sun'], PROPOSED: ['Needs your approval', 'coral'], CHARGING: ['Paying…', 'sun'], COVERED: ['Covered', 'leaf'],
  DECLINED: ['Declined', 'grey'], ANSWERED: ['Answered', 'leaf'], NEEDS_STAFF: ['For staff', 'sky'], ROUTED_TO_LEAD: ['Sent to school lead', 'ink'],
};

export default function Coordinator() {
  const [sel, setSel] = useState<string | null>(null);
  const { data, error, reload } = usePoll<any>(`/api/coordinator${sel ? `?request=${sel}` : ''}`, 1500);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [ask, setAsk] = useState<any>(null);
  const reqs: any[] = data?.requests || [];

  useEffect(() => { if (!sel && reqs.length) setSel((reqs.find((r) => r.status === 'PROPOSED') || reqs[0]).id); }, [reqs.length]);

  async function act(action: string, id: string, override = false) {
    setBusy(id + action); setResult(null);
    try { const r = await post('/api/coordinator', { action, requestId: id, override }); setResult({ ok: true, ...r }); } catch (e: any) { setResult({ ok: false, message: e.message }); }
    setBusy(null); reload();
  }
  async function draftAsk() {
    setBusy('ask');
    try { setAsk(await post('/api/coordinator', { action: 'ask' })); } catch (e: any) { setAsk({ text: e.message }); }
    setBusy(null);
  }
  const selReq = reqs.find((r) => r.id === sel);
  const open = reqs.filter((r) => ['NEW', 'PROPOSED', 'CHARGING', 'NEEDS_STAFF', 'NEEDS_SPONSOR', 'CHARGE_UNKNOWN'].includes(r.status));
  const done = reqs.filter((r) => !['NEW', 'PROPOSED', 'CHARGING', 'NEEDS_STAFF', 'NEEDS_SPONSOR', 'CHARGE_UNKNOWN'].includes(r.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-muted">PTA volunteer · no PayPal login</div>
          <h1 className="text-3xl font-black tracking-tight">Help requests</h1>
          <div className="font-semibold text-muted">You see a code, a category and an amount. Never a name, the message or its language.</div>
        </div>

      </div>
      {error ? <Notice tone="coral">{error}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {open.length === 0 ? <div className="card p-5 text-muted">No open requests. When a family writes privately, a card appears here within seconds.</div> : null}
          {[...open, ...done].map((r) => {
            const [label, tone] = STATUS[r.status] || [r.status, 'grey'];
            return (
              <div key={r.id} onClick={() => setSel(r.id)} className={`card fade-in cursor-pointer p-4 transition ${sel === r.id ? 'ring-2 ring-coral' : ''} ${done.includes(r) ? 'opacity-75' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono rounded-lg bg-ink px-2 py-0.5 text-sm font-bold text-white">{r.code}</span>
                  {r.category ? <Chip tone={CAT_TONE[r.category]}>{r.category.replace('_', ' ').toLowerCase()}</Chip> : null}
                  <Chip tone={tone}>{label}</Chip>
                  {r.scripted ? <Chip title="Seeded or scripted demo message">SCRIPTED</Chip> : null}
                  <span className="ml-auto text-xs text-muted">{r.title} · {timeAgo(r.created_at)}</span>
                </div>
                <div className="mt-2 text-lg font-black">{r.summary || (r.status === 'NEW' ? 'The agent is reading the message…' : '')}</div>
                {r.status === 'NEEDS_SPONSOR' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}><span className="font-semibold text-muted">No pledge has room for {usd(r.amount_cents)}.</span><button className="btn btn-ghost !py-1 text-sm" disabled={!!busy} onClick={() => act('rematch', r.id)}>Match to a new pledge</button></div>
                ) : null}
                {r.amount_cents && ['PROPOSED', 'CHARGING', 'COVERED'].includes(r.status) ? (
                  <div className="mt-1 text-sm font-semibold text-muted">{r.kind_of_help === 'PART_COVER' ? 'Part cover' : 'Cover'} {usd(r.amount_cents)} from pledge {r.pledge}{r.confidence ? ` · confidence ${r.confidence.toLowerCase()}` : ''}</div>
                ) : null}
                {r.fallback && r.fallback !== 'SEEDED' ? <div className="mt-1 text-xs font-bold text-sun">{r.fallback}</div> : null}
                {r.review_reason && ['PROPOSED', 'COVERED'].includes(r.status) ? <div className="mt-2 rounded-xl bg-sun-soft px-3 py-2 text-sm font-semibold text-sun">Second look: {r.review_reason}{r.override_by ? ' · approved after a second look' : ''}</div> : null}
                {r.status === 'PROPOSED' ? (
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {r.review_reason
                      ? <button className="btn btn-leaf" disabled={!!busy} onClick={() => act('approve', r.id, true)}>{busy === r.id + 'approve' ? 'Paying with PayPal…' : `I have checked, approve ${usd(r.amount_cents)}`}</button>
                      : <button className="btn btn-leaf" disabled={!!busy} onClick={() => act('approve', r.id)}>{busy === r.id + 'approve' ? 'Paying with PayPal…' : `Approve ${usd(r.amount_cents)}`}</button>}
                    <button className="btn btn-ghost" disabled={!!busy} onClick={() => act('decline', r.id)}>Pass to staff</button>
                  </div>
                ) : null}
                {r.status === 'NEEDS_STAFF' ? <div className="mt-3" onClick={(e) => e.stopPropagation()}><button className="btn btn-ghost text-sm" onClick={() => act('done', r.id)}>Mark handled</button></div> : null}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          {result ? <Notice tone={result.ok ? 'leaf' : 'coral'}>{result.ok && !result.captureId ? result.message : result.ok ? <>A real PayPal payment. Capture <span className="mono">{result.captureId}</span>. Recorded on the family’s invoice the same way as cash at the office. The teacher sees Paid.</> : result.message}</Notice> : null}
          <TracePanel rows={data?.trace?.rows || []} model={data?.trace?.model} mode={data?.trace?.mode} title={selReq ? `Trace · ${selReq.code}` : 'Agent and PayPal trace'} empty="Select a request to see every step the agent and PayPal took." />
          <div className="card p-4">
            <div className="flex items-center justify-between"><div className="font-black">Sponsor pledges</div><Link href="/sponsor" className="text-sm font-bold text-coral">Sponsor page →</Link></div>
            <div className="mt-2 space-y-2">
              {(data?.pledges || []).length === 0 ? <div className="text-sm text-muted">No pledges yet.</div> : null}
              {(data?.pledges || []).map((p: any) => (
                <div key={p.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="mono font-bold">{p.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream"><div className="h-full bg-leaf" style={{ width: `${Math.round((p.left_cents / p.cap_cents) * 100)}%` }} /></div>
                  <span className="font-bold">{usd(p.left_cents, false)} left</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost mt-3 w-full text-sm" disabled={busy === 'ask'} onClick={draftAsk}>{busy === 'ask' ? 'Forecasting…' : 'Forecast shortfall and draft a sponsor ask'}</button>
            {ask ? (
              <div className="fade-in mt-3 rounded-2xl bg-cream p-3 text-sm">
                <div className="mb-1 flex flex-wrap gap-2"><Chip tone={ask.mode === 'live' ? 'sky' : 'grey'}>{ask.mode === 'live' ? 'AI draft' : 'Template'}</Chip>{ask.needCents !== undefined ? <Chip tone="sun">{usd(ask.leftCents, false)} left · about {usd(ask.needCents, false)} more needed</Chip> : null}</div>
                {ask.text}
                <div className="mt-2"><Link href="/sponsor/join" className="font-bold text-coral">Open the sponsor page →</Link></div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

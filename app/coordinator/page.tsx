'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePoll, post, usd, Chip, Notice, timeAgo } from '@/components/ui';

const CAT_TONE: Record<string, string> = { HARDSHIP: 'coral', PARTIAL: 'sun', TIMING: 'sky', QUESTION: 'sky', NOT_ATTENDING: 'grey', SAFEGUARDING: 'ink', OTHER: 'grey' };
const STATUS: Record<string, [string, string]> = {
  NEW: ['Claude is reading…', 'grey'], NEEDS_SPONSOR: ['Waiting for a sponsor', 'sun'], CHARGE_UNKNOWN: ['Checking with PayPal', 'sun'], PROPOSED: ['Needs your approval', 'coral'], CHARGING: ['Paying…', 'sun'], COVERED: ['Covered', 'leaf'],
  DECLINED: ['Declined', 'grey'], ANSWERED: ['Answered', 'leaf'], NEEDS_STAFF: ['For staff', 'sky'], ROUTED_TO_LEAD: ['Sent to school lead', 'ink'],
};
const OPEN = ['NEW', 'PROPOSED', 'CHARGING', 'NEEDS_STAFF', 'NEEDS_SPONSOR', 'CHARGE_UNKNOWN'];

// Long summaries shout when they are all bold. The first phrase is the headline; the rest is detail.
function splitSummary(s: string): [string, string] {
  const parts = (s || '').split(' · ');
  let head = parts.shift() || '';
  while (parts.length && (head + ' · ' + parts[0]).length <= 60) head += ' · ' + parts.shift();
  return [head, parts.join(' · ')];
}

export default function Coordinator() {
  const [sel, setSel] = useState<string | null>(null);
  const { data, error, reload } = usePoll<any>('/api/coordinator', 1500);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [ask, setAsk] = useState<any>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // The demo stage can point at one family's card (?focus=F-07): it comes first.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { setFocus(new URLSearchParams(window.location.search).get('focus')); }, []);
  const reqs: any[] = data?.requests || [];

  async function act(action: string, id: string, override = false) {
    setBusy(id + action); setResult(null);
    try { const r = await post('/api/coordinator', { action, requestId: id, override }); setResult({ ok: true, ...r }); } catch (e: any) { setResult({ ok: false, message: e.message }); }
    setBusy(null); reload();
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
  async function draftAsk() {
    setBusy('ask');
    try { setAsk(await post('/api/coordinator', { action: 'ask' })); } catch (e: any) { setAsk({ text: e.message }); }
    setBusy(null);
  }
  const rank = (r: any) => (focus && r.code === focus && !r.scripted ? 2 : 0) + (r.status === 'PROPOSED' ? 1 : 0);
  const open = reqs.filter((r) => OPEN.includes(r.status)).sort((a, b) => rank(b) - rank(a));
  const done = reqs.filter((r) => !OPEN.includes(r.status)).sort((a, b) => rank(b) - rank(a));
  const focused = focus ? done.find((r) => r.code === focus && !r.scripted) : null;
  const pledges: any[] = data?.pledges || [];
  const left = pledges.reduce((s, p) => s + p.left_cents, 0);

  const card = (r: any) => {
    const [label, tone] = STATUS[r.status] || [r.status, 'grey'];
    const [head, rest] = splitSummary(r.summary || (r.status === 'NEW' ? 'Claude is reading the message…' : ''));
    const finished = !OPEN.includes(r.status);
    return (
      <article key={r.id} aria-label={`Request ${r.code}`} className={`card fade-in p-4 transition ${sel === r.id ? 'ring-2 ring-ink/40' : ''} ${finished ? 'opacity-90' : ''}`} onClick={() => setSel(r.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono rounded-lg bg-ink px-2 py-0.5 text-sm font-bold text-white">{r.code}</span>
          {r.category ? <Chip tone={CAT_TONE[r.category]}>{r.category.replace('_', ' ').toLowerCase()}</Chip> : null}
          <Chip tone={tone}>{label}</Chip>
          <span className="ml-auto text-xs text-muted">{r.title} · {timeAgo(r.created_at)}</span>
        </div>
        <h3 className={`mt-2 font-extrabold ${finished ? 'text-base' : 'text-lg'}`}>{head}</h3>
        {rest ? <p className="mt-0.5 text-sm text-muted">{rest}</p> : null}
        {r.status === 'NEEDS_SPONSOR' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-muted">No pledge has room for {usd(r.amount_cents)}.</span><button className="btn btn-ghost !min-h-9 !py-1 text-sm" disabled={!!busy} onClick={() => act('rematch', r.id)}>Match to a new pledge</button></div>
        ) : null}
        {r.amount_cents && ['PROPOSED', 'CHARGING', 'COVERED'].includes(r.status) ? (
          <div className="mt-1 text-sm font-semibold text-muted">{r.kind_of_help === 'PART_COVER' ? 'Part cover' : 'Cover'} {usd(r.amount_cents)} from pledge {r.pledge}{r.confidence ? ` · Claude is ${r.confidence.toLowerCase()} confidence` : ''}</div>
        ) : null}
        {r.fallback && r.fallback !== 'SEEDED' ? <div className="mt-1 text-xs font-bold text-sun">{r.fallback}</div> : null}
        {r.review_reason && ['PROPOSED', 'COVERED'].includes(r.status) ? <div className="mt-2 rounded-xl bg-sun-soft px-3 py-2 text-sm font-semibold text-sun">Second look: {r.review_reason}{r.override_by ? ' · approved after a second look' : ''}</div> : null}
        {r.status === 'PROPOSED' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.review_reason
              ? <button className="btn btn-leaf" disabled={!!busy} onClick={() => act('approve', r.id, true)}>{busy === r.id + 'approve' ? 'Paying with PayPal…' : `I have checked, approve ${usd(r.amount_cents)}`}</button>
              : <button className="btn btn-leaf" disabled={!!busy} onClick={() => act('approve', r.id)}>{busy === r.id + 'approve' ? 'Paying with PayPal…' : `Approve ${usd(r.amount_cents)}`}</button>}
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => act('decline', r.id)}>Not sure, ask staff</button>
          </div>
        ) : null}
        {r.status === 'NEEDS_STAFF' ? <div className="mt-3"><button className="btn btn-ghost !min-h-9 text-sm" onClick={() => act('done', r.id)}>Mark handled</button></div> : null}
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow">PTA volunteer · no PayPal login</div>
        <h1 className="text-[32px] font-extrabold leading-[1.1]">Help requests</h1>
        <p className="mt-1 font-semibold text-muted">Claude reads each private message and suggests what to do. You approve. You see a code and an amount, never a name or the message.</p>
      </div>

      {/* Sponsor money: always in view, never pushed below the list */}
      <section aria-label="Sponsor money left" className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div><div className="eyebrow">Sponsor money left</div><div className="text-xl font-extrabold">{usd(left, false)}</div></div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          {pledges.length === 0 ? <div className="text-sm text-muted">No pledges yet.</div> : null}
          {pledges.map((p: any) => (
            <div key={p.label} className="flex items-center gap-2 text-sm">
              <span className="mono w-16 font-bold">{p.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-leaf" style={{ width: `${Math.round((p.left_cents / p.cap_cents) * 100)}%` }} /></div>
              <span className="w-16 text-right font-bold">{usd(p.left_cents, false)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-start gap-1 text-sm">
          <Link href="/sponsor" className="font-bold text-coral">Sponsors →</Link>
          <button className="text-left font-bold text-coral disabled:text-muted" disabled={busy === 'ask'} onClick={draftAsk}>{busy === 'ask' ? 'Claude is forecasting…' : 'Running low? Ask Claude →'}</button>
        </div>
        {ask ? (
          <div className="fade-in basis-full rounded-2xl bg-cream p-3 text-sm">
            <div className="mb-1 flex flex-wrap gap-2"><Chip tone={ask.mode === 'live' ? 'sky' : 'grey'}>{ask.mode === 'live' ? 'AI draft' : 'Template'}</Chip>{ask.needCents !== undefined ? <Chip tone="sun">{usd(ask.leftCents, false)} left · about {usd(ask.needCents, false)} more needed</Chip> : null}</div>
            {ask.text}
          </div>
        ) : null}
      </section>

      {error ? <Notice tone="coral">{error}</Notice> : null}
      <div ref={resultRef} aria-live="polite">
        {result ? <Notice tone={result.ok ? 'leaf' : 'coral'}>{result.ok && !result.captureId ? result.message : result.ok ? 'Paid with PayPal from a sponsor’s saved account, and recorded on the family’s invoice like cash at the office. The teacher now sees Paid.' : result.message}</Notice> : null}
      </div>

      <div className="space-y-3">
        {focused ? card(focused) : null}
        {open.length === 0 && !focused ? <div className="card p-5 text-muted">Nothing waiting. When a family writes privately, a card appears here within seconds.</div> : null}
        {open.map(card)}
        {done.filter((r) => r !== focused).length ? (
          <details className="group">
            <summary className="cursor-pointer list-none px-1 py-2 text-sm font-extrabold text-muted hover:text-ink">Handled ({done.filter((r) => r !== focused).length}) <span aria-hidden className="inline-block transition group-open:rotate-90">▸</span></summary>
            <div className="mt-2 space-y-3">{done.filter((r) => r !== focused).map(card)}</div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

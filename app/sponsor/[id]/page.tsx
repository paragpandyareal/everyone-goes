'use client';
import { use, useState } from 'react';
import { usePoll, post, usd, Chip, Notice } from '@/components/ui';

export default function SponsorImpact({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = usePoll<any>(`/api/sponsor?pledge=${id}`, 3000);
  const [stopErr, setStopErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const joined = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('joined');
  const waiting = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('waiting');
  if (error && !data) return <Notice tone="coral">{error}</Notice>;
  if (!data) return <div className="text-muted">Loading…</div>;
  const pct = Math.min(100, Math.round((data.usedCents / data.capCents) * 100));
  async function stop() {
    if (!confirm('Stop your pledge? Your saved PayPal account will be deleted and no further covers will be charged.')) return;
    setBusy(true); setStopErr(null);
    try { await post('/api/sponsor', { action: 'stop', pledgeId: id }); } catch (e: any) { setStopErr(e.message); }
    setBusy(false); reload();
  }
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {joined ? <Notice tone="leaf">Your PayPal account is saved for this pledge. Nothing has been charged.{typeof window !== 'undefined' && window.opener ? ' You can close this tab.' : ''}</Notice> : null}
      {waiting && !data.saved && data.status === 'PENDING' ? <Notice>Approve on PayPal in the new tab. This page updates by itself when your account is saved.</Notice> : null}
      {waiting && data.saved ? <Notice tone="leaf">Your PayPal account is saved for this pledge. Nothing has been charged.</Notice> : null}
      <div className="card overflow-hidden">
        <div className="bg-leaf px-5 py-4 text-white">
          <div className="text-sm font-bold opacity-90">{data.sponsor}{data.seeded ? ' · seeded' : ''}</div>
          <div className="text-3xl font-black">{data.children ? `${data.children} ${data.children === 1 ? 'contribution' : 'contributions'} covered, so no family had to ask in public` : 'You’re set. Your first cover will appear here.'}</div>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex justify-between font-bold"><span>{usd(data.usedCents, false)} of {usd(data.capCents, false)} used</span><span className="text-muted">max {usd(data.perChildCents, false)} per child</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-cream"><div className="h-full bg-leaf transition-all" style={{ width: `${pct}%` }} /></div>
          {data.conditions ? <div className="text-sm text-muted">{data.conditions}</div> : null}
          <div className="flex flex-wrap gap-2"><Chip tone={data.status === 'ACTIVE' ? 'leaf' : 'grey'}>{data.status.toLowerCase()}</Chip>{data.saved ? <Chip tone="sky">PayPal account saved</Chip> : <Chip>No saved account</Chip>}</div>
        </div>
      </div>
      <div className="card p-4">
        <div className="font-black">Receipts</div>
        <div className="text-sm text-muted">Every cover is one PayPal payment from your account. No names, codes or classes, by design. Keep these for your records: you received no goods or services in return. The PTA issues any official tax receipt.{data.owner ? '' : ' Capture IDs are shown only to the sponsor, in the browser they joined from.'}</div>
        <ul className="mt-2 divide-y divide-line text-sm">
          {data.covers.length === 0 ? <li className="py-2 text-muted">No covers yet.</li> : null}
          {data.covers.map((c: any, i: number) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2"><span>{new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · a contribution covered</span><span className="text-right"><b>{usd(c.amountCents)}</b><br />{c.captureId ? <span className="mono text-xs text-muted">capture {c.captureId}</span> : null}</span></li>
          ))}
        </ul>
      </div>
      {data.status === 'ACTIVE' && data.owner ? <button className="btn btn-ghost w-full" disabled={busy} onClick={stop}>Stop my pledge</button> : null}
      {stopErr ? <Notice tone="coral">{stopErr}</Notice> : null}
    </div>
  );
}

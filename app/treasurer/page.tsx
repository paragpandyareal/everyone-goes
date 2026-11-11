'use client';
import { useState } from 'react';
import { usePoll, post, usd, Chip, Notice, TracePanel, Stat } from '@/components/ui';

export default function Treasurer() {
  const { data, error, reload } = usePoll<any>('/api/treasurer', 3000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<any>(null);
  async function settle() {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, ...(await post('/api/treasurer', {})) }); } catch (e: any) { setMsg({ ok: false, message: e.message }); }
    setBusy(false); reload();
  }
  if (error && !data) return <Notice tone="coral">{error}</Notice>;
  if (!data) return <div className="text-muted">Loading…</div>;
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-extrabold text-muted">PTA treasurer</div>
        <h1 className="text-3xl font-black">Cover Fund reconciliation</h1>
        <div className="font-semibold text-muted">Covers are paid into the Cover Fund account. Once a week one Payout moves the total to the Trips account, as a single line, so no payout can be matched to a child.</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Paid on PayPal" value={data.payments.on_paypal} sub="families who paid on PayPal’s invoice page" />
        <Stat label="Recorded" value={data.payments.recorded} sub="office cash and covers, identical on PayPal" />
        <Stat label="Tips" value={usd(data.payments.tips)} sub="added by families" />
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="text-xs font-extrabold uppercase text-muted">Not yet settled</div><div className="text-2xl font-black">{data.unsettledCount} covers = {usd(data.unsettledCents)}</div></div>
        <button className="btn btn-primary" disabled={busy || !data.unsettledCount} onClick={settle}>{busy ? 'Sending Payout…' : 'Settle now with one PayPal Payout'}</button>
      </div>
      {msg ? <Notice tone={msg.ok ? 'leaf' : 'coral'}>{msg.ok ? `Payout batch ${msg.batch} created.` : msg.message}</Notice> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <div className="font-black">Settlements</div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.settlements.length === 0 ? <li className="py-2 text-muted">None yet.</li> : null}
            {data.settlements.map((s: any) => (
              <li key={s.id} className="py-2">
                <div className="font-bold">{s.cover_count} covers = {usd(s.total_cents)} = Payout batch <span className="mono">{s.batch_id || '…'}</span></div>
                <div className="flex gap-2"><Chip tone={s.status === 'SUCCESS' ? 'leaf' : s.status === 'FAILED' || s.status === 'DENIED' ? 'coral' : 'sun'}>{s.status}</Chip><span className="text-muted">{new Date(s.created_at).toLocaleString()}</span></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="font-black">Covers (Cover Fund side)</div>
          <div className="text-xs text-muted">Date, PayPal capture and amount only. The link to a family exists only encrypted inside the app.</div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.covers.map((c: any) => (
              <li key={c.capture_id} className="flex justify-between gap-2 py-1.5"><span className="text-muted">{new Date(c.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><span className="mono truncate text-muted">{c.capture_id}</span><b>{usd(c.amount_cents)}</b>{c.settlement_id ? <Chip tone="leaf">settled</Chip> : <Chip tone="sun">open</Chip>}</li>
            ))}
          </ul>
        </div>
      </div>
      <TracePanel rows={data.trace || []} title="Payout activity" />
    </div>
  );
}

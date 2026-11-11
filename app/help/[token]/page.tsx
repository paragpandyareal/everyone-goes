'use client';
import { use, useState } from 'react';
import { usePoll, post, usd, StatusChip, Notice } from '@/components/ui';
import { Logo } from '@/components/nav';

const EXAMPLES = [
  { label: 'Polish', text: 'Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.' },
  { label: 'Spanish', text: 'Este mes no podemos pagar la excursión, lo siento mucho.' },
  { label: 'Vietnamese', text: 'Xin lỗi, tháng này nhà tôi không đủ tiền đóng cho chuyến đi.' },
];

export default function HelpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, error, reload } = usePoll<any>(`/api/help/${token}`, 2000);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    try { await post(`/api/help/${token}`, { text }); setText(''); reload(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  if (error && !data) return <Notice tone="coral">{error}</Notice>;
  if (!data) return <div className="text-muted">Loading…</div>;
  const waiting = data.thread.some((m: any) => m.pending);
  return (
    <div className="mx-auto max-w-[420px] space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 bg-coral px-4 py-3 text-white"><Logo size={32} /><div><div className="text-xs font-bold opacity-90">Room 12 PTA</div><div className="font-black leading-tight">{data.title}</div></div></div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between"><div className="font-bold">{data.child}’s contribution</div><StatusChip status={data.status} /></div>
          <div className="text-3xl font-black">{usd(data.amountCents)}</div>
          <div className="text-sm text-muted">Requested contribution. No child will miss this because of cost.</div>
          {data.status !== 'Paid' && data.payUrl ? <a href={data.payUrl} target="_blank" rel="noreferrer" className="btn btn-primary w-full">Pay on PayPal</a> : null}
          {data.status === 'Paid' ? <Notice tone="leaf">All done. {data.child} is going.</Notice> : null}
        </div>
      </div>

      <div className="card p-4">
        <div className="font-black">Can’t pay, or need more time?</div>
        <p className="text-sm text-muted">Tell us privately, in any language. Your teacher will not see this message. Nobody will ask for proof.</p>
        <div className="mt-3 space-y-3">
          {data.thread.map((m: any) => (
            <div key={m.id} className="space-y-2">
              <div className="ml-8 rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-white">{m.text}</div>
              {m.pending ? <div className="mr-8 rounded-2xl rounded-bl-sm bg-cream px-3 py-2 text-sm text-muted">Received. We’re looking at it now…</div> : null}
              {m.reply ? (
                <div className="mr-8 rounded-2xl rounded-bl-sm bg-leaf-soft px-3 py-2">
                  <div>{m.reply}</div>
                  {m.replyEn && m.replyEn !== m.reply ? <div className="mt-1 border-t border-leaf/20 pt-1 text-xs italic text-muted">English: {m.replyEn}</div> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {!waiting ? (
          <div className="mt-3 space-y-2">
            <textarea className="input min-h-24" placeholder="Write here in your language…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="font-bold text-muted">Demo examples:</span>
              {EXAMPLES.map((x) => <button key={x.label} onClick={() => setText(x.text)} className="chip bg-sky-soft text-sky">{x.label}</button>)}
            </div>
            <button className="btn btn-primary w-full" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? 'Sending…' : 'Send privately'}</button>
            {err ? <div className="text-sm font-bold text-coral">{err}</div> : null}
          </div>
        ) : null}
      </div>
      <p className="px-2 text-center text-xs text-muted">Only a volunteer coordinator sees a short summary with a code, never your name or your words. Your words are deleted after 30 days.</p>
    </div>
  );
}

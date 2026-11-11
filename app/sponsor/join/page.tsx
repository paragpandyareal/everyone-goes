'use client';
import { useState } from 'react';
import { post, usd, Chip, Notice } from '@/components/ui';
import { useFramed } from '@/components/lens';

export default function Join() {
  const [name, setName] = useState("Rosa's Bakery");
  const [text, setText] = useState('Up to $250 this term, at most $60 per child.');
  const [terms, setTerms] = useState<any>(null);
  const [mode, setMode] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const framed = useFramed();

  async function read() {
    setBusy(true); setErr(null);
    try { const r = await post('/api/sponsor', { action: 'read', text }); setTerms(r.terms); setMode(r.mode); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function go() {
    setBusy(true); setErr(null);
    // PayPal's pages refuse to load inside a frame, so on the demo stage PayPal opens in a new tab (opened now, during the click,
    // so the browser does not block it) and this page moves on to the pledge page, which updates once PayPal is done.
    const tab = framed ? window.open('about:blank', '_blank') : null;
    try {
      const r = await post('/api/sponsor', { action: 'start', name, terms });
      if (tab) { tab.location.href = r.approveUrl; window.location.href = `/sponsor/${r.pledgeId}?waiting=1`; } else window.location.href = r.approveUrl;
    } catch (e: any) { tab?.close(); setErr(e.message); setBusy(false); }
  }
  const cancelled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cancelled');
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-black">Pledge to Room 12</h1>
      <p className="font-semibold text-muted">Cover a child whose family can’t pay, without anyone knowing who. You set the limits in plain words.</p>
      {cancelled ? <Notice>PayPal was closed before saving. Nothing was charged. You can try again.</Notice> : null}
      <div className="card space-y-3 p-4">
        <label className="block text-sm font-bold">Business name<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="block text-sm font-bold">Your pledge, in your own words<textarea className="input mt-1 min-h-20" value={text} onChange={(e) => { setText(e.target.value); setTerms(null); }} maxLength={400} /></label>
        {!terms ? <button className="btn btn-primary" disabled={busy || text.length < 5} onClick={read}>{busy ? 'Claude is reading…' : 'Read my pledge'}</button> : null}
      </div>
      {terms ? (
        <div className="card fade-in space-y-3 p-4">
          <div className="flex flex-wrap gap-2"><Chip tone={mode === 'live' ? 'sky' : 'grey'}>{mode === 'live' ? 'Read by AI' : 'Read by rules'}</Chip><Chip tone="leaf">Total {usd(terms.cap_cents, false)}</Chip><Chip tone="leaf">Per child {usd(terms.per_child_cap_cents, false)}</Chip>{terms.tags.map((t: string) => <Chip key={t}>{t.replace('_', ' ')}</Chip>)}</div>
          <div className="font-semibold">{terms.restated}</div>
          <div className="rounded-2xl bg-cream p-3 text-sm">
            You authorise <b>Room 12 PTA Cover Fund</b> to charge this PayPal account each time a contribution is covered from your pledge, up to <b>{usd(terms.cap_cents, false)}</b> in total and <b>{usd(terms.per_child_cap_cents, false)}</b> per child. You get a receipt for every charge and can stop at any time with one click.
          </div>
          <button className="btn btn-primary w-full" disabled={busy} onClick={go}>{busy ? 'Opening PayPal…' : framed ? 'Agree and open PayPal (new tab) ↗' : 'Agree and save with PayPal'}</button>
          <div className="text-center text-xs text-muted">Nothing is charged now. PayPal saves your account for this pledge only. Next: PayPal opens, you approve, and you come back here.</div>
          <div className="rounded-2xl bg-cream p-3 text-xs text-muted"><b className="text-ink">Tax.</b> If this PTA is a registered 501(c)(3) charity, your covers may be tax-deductible. Some businesses record them as a sponsorship expense instead. You never choose a child, and you receive nothing in return. Ask your accountant; Everyone Goes does not give tax advice.</div>
        </div>
      ) : null}
      {err ? <Notice tone="coral">{err}</Notice> : null}
    </div>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { usePoll, post, usd, Chip, StatusChip, Notice } from '@/components/ui';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  fontFamily: 'var(--font-nunito), system-ui, sans-serif', fontSize: 15, headerFontWeight: 800, headerBackgroundColor: '#fbf5ec',
  borderColor: '#ece3d6', rowBorder: { color: '#f2ebe0' }, wrapperBorderRadius: 16, accentColor: '#b93f1b', backgroundColor: '#ffffff', rowHeight: 46, headerHeight: 42,
});

type Row = { child: string; parent: string; status: string; paidCents: number };

export default function Teacher() {
  const [collection, setCollection] = useState<string | null>(null);
  const { data, error, reload } = usePoll<any>(`/api/teacher${collection ? `?collection=${collection}` : ''}`, 2500);
  const [sentence, setSentence] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const prev = useRef<Record<string, string>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});
  // The demo stage can point at one row (?highlight=Zofia): it is pinned to the top and marked "Just now" once paid.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => { setHighlight(new URLSearchParams(window.location.search).get('highlight')); }, []);

  useEffect(() => {
    if (!data?.rows) return;
    const f: Record<string, number> = {};
    for (const r of data.rows as Row[]) { const k = r.child + r.parent; if (prev.current[k] && prev.current[k] !== r.status && r.status === 'Paid') f[k] = Date.now(); prev.current[k] = r.status; }
    if (Object.keys(f).length) setFlash((x) => ({ ...x, ...f }));
  }, [data]);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 640); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'child', headerName: 'Child', flex: 1.1, minWidth: 110, cellClass: 'font-extrabold', cellRenderer: (p: any) => <span className="flex items-center gap-2">{p.value}{highlight && p.value === highlight && p.data?.status === 'Paid' ? <Chip tone="leaf">Just now</Chip> : null}</span> },
    { field: 'status', headerName: 'Status', flex: 1, minWidth: 120, cellRenderer: (p: any) => <StatusChip status={p.value} />, sort: 'asc', comparator: (a: string, b: string) => order(a) - order(b) },
    { field: 'parent', headerName: 'Parent or carer', flex: 1.4, minWidth: 150, hide: narrow },
    { field: 'paidCents', headerName: 'Paid', flex: 0.8, minWidth: 90, valueFormatter: (p: any) => (p.value ? usd(p.value) : '–') },
  ], [narrow, highlight]);

  async function makeDraft() {
    setBusy(true); setMsg(null);
    try { const r = await post('/api/collections', { sentence }); setDraft(r.draft); setRunId(r.runId); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }
  async function confirm() {
    setBusy(true); setMsg(null);
    try { const r = await post('/api/collections', { confirm: true, runId, sentence, roster: draft.kind === 'CLUB_FEE' ? 'soccer' : 'room12' }); setCollection(r.id); setDraft(null); setSentence(''); reload(); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const c = data?.counters;
  const rows: Row[] = data?.rows || [];
  const notYet = rows.filter((r) => r.status !== 'Paid').length;
  const pct = c?.total ? Math.round((c.paid / c.total) * 100) : 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Ms Rivera · Room 12</div>
          <h1 className="text-[32px] font-extrabold leading-[1.1]">{data?.collection?.title || 'Collections'}</h1>
          {data?.collection ? <div className="mt-1 font-semibold text-muted">{usd(data.collection.amount_cents)} requested contribution · paid through PayPal invoices</div> : null}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Collections">
          {(data?.collections || []).map((x: any) => {
            const on = data?.collection?.id === x.id;
            return (
              <button key={x.id} aria-pressed={on} onClick={() => { setCollection(x.id); fetch('/api/collections', { method: 'PUT', body: JSON.stringify({ id: x.id }) }); }} className={`btn !min-h-9 !py-1.5 text-sm ${on ? 'bg-ink text-white' : 'btn-ghost'}`}>
                {x.title} <span className="opacity-80">{x.paid}/{x.families}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <Notice tone="coral">{error}</Notice> : null}

      {c ? (
        <div className="card px-4 py-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div><span className="text-2xl font-extrabold">{c.paid} of {c.total}</span> <span className="font-semibold text-muted">paid</span></div>
            <div className="text-sm font-bold text-muted">{notYet ? `${notYet} not yet · still to pay, or quietly getting help` : 'Everyone is going'}</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-2 text-xs font-semibold text-muted">You see Paid or Not paid yet. Never who asked for help, or how a row was paid.</div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div style={{ height: Math.min(46 * Math.max(rows.length, 6) + 46, 1150) }} className="ag-theme-eg">
          {data?.empty ? <Notice>No collection yet. Create one below in one sentence.</Notice> : (
            <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} getRowId={(p) => p.data.child + p.data.parent}
              postSortRows={(p) => { if (!highlight) return; const i = p.nodes.findIndex((n) => n.data?.child === highlight); if (i > 0) p.nodes.unshift(...p.nodes.splice(i, 1)); }}
              rowClassRules={{ flash: (p) => !!p.data && Date.now() - (flash[p.data.child + p.data.parent] || 0) < 1700, 'just-paid': (p) => !!highlight && p.data?.child === highlight && p.data?.status === 'Paid' }} />
          )}
        </div>
        <div className="space-y-4">
          {data?.qr ? (
            <div className="card p-4 text-center">
              <h2 className="text-[15px] font-bold">QR code for the paper letter</h2>
              <img src={data.qr} alt="PayPal invoice QR code" className="mx-auto my-2 w-36" />
              <div className="text-xs text-muted">Made by PayPal. Every invoice says: “No child will miss this because of cost. Need help? Tell us privately.”</div>
            </div>
          ) : null}
        </div>
      </div>

      <details className="card p-4" open={!!draft || !!data?.empty}>
        <summary className="cursor-pointer list-none font-bold">+ New collection in one sentence <span className="font-semibold text-muted">· Claude drafts it, PayPal sends one invoice per family</span></summary>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="input" aria-label="New collection in one sentence" placeholder='e.g. "Aquarium trip, Friday 20 Nov, $30 requested contribution"' value={sentence} onChange={(e) => setSentence(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sentence && makeDraft()} />
          <button className="btn btn-primary" disabled={busy || sentence.length < 5} onClick={makeDraft}>{busy && !draft ? 'Reading…' : 'Draft it'}</button>
        </div>
        {draft ? (
          <div className="fade-in mt-3 rounded-2xl bg-cream p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Chip tone="sky">AI draft</Chip><b>{draft.title}</b> · {draft.kind === 'TRIP' ? 'Trip' : 'Club fee'} · {usd(draft.amount_cents)}{draft.due_date ? ` · due ${draft.due_date}` : ''}
            </div>
            <div className="mt-1 text-sm text-muted">Line item: “{draft.item_name}”. One PayPal invoice per family ({draft.kind === 'TRIP' ? 24 : 16}), tip and partial payment on, no child names, each with a private help link.</div>
            {draft.warning ? <div className="mt-1 text-sm font-bold text-coral">{draft.warning}</div> : null}
            <div className="mt-2 flex gap-2"><button className="btn btn-leaf" disabled={busy || !(draft.amount_cents > 0)} onClick={confirm}>Create and send invoices</button><button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button></div>
          </div>
        ) : null}
        {msg ? <div role="alert" className="mt-2 text-sm font-bold text-coral">{msg}</div> : null}
      </details>
    </div>
  );
}
const order = (s: string) => ({ 'Not yet': 0, 'Part paid': 1, Issuing: 2, Error: 3, Paid: 4 } as any)[s] ?? 5;

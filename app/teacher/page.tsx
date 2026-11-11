'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { usePoll, post, usd, Chip, Stat, StatusChip, TracePanel, Notice } from '@/components/ui';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  fontFamily: 'var(--font-nunito), system-ui, sans-serif', fontSize: 15, headerFontWeight: 800, headerBackgroundColor: '#fbf5ec',
  borderColor: '#ece3d6', rowBorder: { color: '#f2ebe0' }, wrapperBorderRadius: 16, accentColor: '#e4572e', backgroundColor: '#ffffff', rowHeight: 46, headerHeight: 42,
});

type Row = { child: string; parent: string; status: string; paidCents: number; tipCents: number; seeded: boolean; updatedAt: string; payUrl: string | null };

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

  useEffect(() => {
    if (!data?.rows) return;
    const f: Record<string, number> = {};
    for (const r of data.rows as Row[]) { const k = r.child + r.parent; if (prev.current[k] && prev.current[k] !== r.status && r.status === 'Paid') f[k] = Date.now(); prev.current[k] = r.status; }
    if (Object.keys(f).length) setFlash((x) => ({ ...x, ...f }));
  }, [data]);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 640); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: 'child', headerName: 'Child', flex: 1.1, minWidth: 100, cellClass: 'font-extrabold' },
    { field: 'status', headerName: 'Status', flex: 1, minWidth: 110, cellRenderer: (p: any) => <StatusChip status={p.value} />, sort: 'asc', comparator: (a: string, b: string) => order(a) - order(b) },
    { field: 'parent', headerName: 'Parent or carer', flex: 1.4, minWidth: 150, hide: narrow },
    { field: 'paidCents', headerName: 'Paid', flex: 0.8, minWidth: 90, valueFormatter: (p: any) => (p.value ? usd(p.value) : '–') },
    { field: 'tipCents', headerName: 'Tip', flex: 0.7, minWidth: 80, hide: narrow, valueFormatter: (p: any) => (p.value ? `+${usd(p.value)}` : '') },
    { field: 'seeded', headerName: '', width: 96, hide: narrow, cellRenderer: (p: any) => (p.value ? <Chip title="Recorded as an office payment while seeding the demo">SEEDED</Chip> : null) },
  ], [narrow]);

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
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-muted">Ms Rivera · Room 12</div>
          <h1 className="text-3xl font-black tracking-tight">{data?.collection?.title || 'Collections'}</h1>
          {data?.collection ? <div className="text-muted font-semibold">{usd(data.collection.amount_cents)} requested contribution · {data.collection.kind === 'TRIP' ? 'trip' : 'club fee'} · paid through PayPal invoices</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(data?.collections || []).map((x: any) => (
            <button key={x.id} onClick={() => { setCollection(x.id); fetch('/api/collections', { method: 'PUT', body: JSON.stringify({ id: x.id }) }); }} className={`btn ${data?.collection?.id === x.id ? 'btn-primary' : 'btn-ghost'} !py-1.5 text-sm`}>
              {x.title} <span className="opacity-80">{x.paid}/{x.families}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <Notice tone="coral">{error}</Notice> : null}

      <div className="card p-4">
        <div className="mb-2 font-black">New collection, in one sentence</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input" placeholder='e.g. "Aquarium trip, Friday 20 Nov, $30 requested contribution"' value={sentence} onChange={(e) => setSentence(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sentence && makeDraft()} />
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
        {msg ? <div className="mt-2 text-sm font-bold text-coral">{msg}</div> : null}
      </div>

      {c ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Paid" value={`${c.paid} of ${c.total}`} sub={notYet ? `${notYet} not yet` : 'Everyone is going'} tone={notYet ? undefined : 'leaf'} />
          <Stat label="Not yet" value={notYet} sub="a gentle reminder goes automatically" tone={notYet ? 'coral' : undefined} />
          <Stat label="Tips received" value={usd(c.tips)} sub="added by families on PayPal" />
          <Stat label="Local sponsors" value={c.sponsors_saved} sub="saved on PayPal, ready to help" />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div style={{ height: Math.min(46 * Math.max(rows.length, 6) + 46, 1150) }} className="ag-theme-eg">
          {data?.empty ? <Notice>No collection yet. Type one sentence above to create one.</Notice> : (
            <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} getRowId={(p) => p.data.child + p.data.parent} suppressCellFocus
              rowClassRules={{ flash: (p) => !!p.data && Date.now() - (flash[p.data.child + p.data.parent] || 0) < 1700 }} />
          )}
        </div>
        <div className="space-y-4">
          {data?.qr ? (
            <div className="card p-4 text-center">
              <div className="font-black">QR code for the paper letter</div>
              <img src={data.qr} alt="PayPal invoice QR code" className="mx-auto my-2 w-40" />
              <div className="text-xs text-muted">Generated by PayPal for the first invoice. Each letter gets its family’s own code.</div>
            </div>
          ) : null}
          <div className="card p-4 text-sm">
            <div className="font-black">What the invoice says</div>
            <p className="mt-1 text-muted">“Requested contribution. No child will miss this {data?.collection?.kind === 'TRIP' ? 'trip' : ''} because of cost. Need help or more time? Tell us privately at …”</p>
            <p className="mt-2 text-muted">You see Paid or Not yet. You never see who asked for help or how a row was paid.</p>
          </div>
          <TracePanel rows={data?.trace || []} title="PayPal activity" />
        </div>
      </div>
    </div>
  );
}
const order = (s: string) => ({ 'Not yet': 0, 'Part paid': 1, Issuing: 2, Error: 3, Paid: 4 } as any)[s] ?? 5;

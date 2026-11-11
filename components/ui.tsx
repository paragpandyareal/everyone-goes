'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export const usd = (c: number | null | undefined, dp = true) => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: dp ? 2 : 0, maximumFractionDigits: dp ? 2 : 0 });

export function usePoll<T = any>(url: string | null, ms = 2500): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const load = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      const r = await fetch(urlRef.current, { cache: 'no-store' });
      const j = await r.json();
      if (r.status === 401 && j.signIn) { window.location.href = `${j.signIn}?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (!r.ok) setError(j.error || `Error ${r.status}`); else { setData(j); setError(null); }
    } catch (e: any) { setError('Connection problem. Retrying…'); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, ms);
    return () => clearInterval(t);
  }, [url, ms, load]);
  return { data, error, reload: load };
}

export async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || `Error ${r.status}`);
  return j;
}

const TONES: Record<string, string> = {
  leaf: 'bg-leaf-soft text-leaf', coral: 'bg-coral-soft text-coral', sun: 'bg-sun-soft text-sun', sky: 'bg-sky-soft text-sky', grey: 'bg-[#efebe4] text-muted', ink: 'bg-ink text-white',
};
export function Chip({ tone = 'grey', children, title }: { tone?: keyof typeof TONES | string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`chip ${TONES[tone] || TONES.grey}`}>{children}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const tone = status === 'Paid' ? 'leaf' : status === 'Part paid' ? 'sun' : status === 'Not yet' ? 'coral' : 'grey';
  return <Chip tone={tone}>{status === 'Paid' ? '✓ ' : ''}{status}</Chip>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-black ${tone === 'leaf' ? 'text-leaf' : tone === 'coral' ? 'text-coral' : ''}`}>{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'sun', children }: { tone?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${TONES[tone] || TONES.sun}`}>{children}</div>;
}

export type TraceRow = { at: number; kind: string; tool: string; via: string; summary: string; paypalId?: string; debugId?: string; approvedBy?: string; ok: boolean; demo?: string };

export function TracePanel({ rows, title = 'Agent and PayPal trace', model, mode, empty = 'Nothing yet.' }: { rows: TraceRow[]; title?: string; model?: string | null; mode?: string | null; empty?: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="font-black">{title}</div>
        {model ? <Chip tone={mode === 'live' ? 'sky' : 'grey'}>{mode === 'live' ? `AI · ${model}` : 'Rules (AI off)'}</Chip> : null}
      </div>
      <ol className="divide-y divide-line text-sm">
        {rows.length === 0 ? <li className="px-4 py-3 text-muted">{empty}</li> : null}
        {rows.map((r, i) => (
          <li key={i} className="fade-in grid grid-cols-[auto_1fr] gap-x-3 px-4 py-2">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${!r.ok ? 'bg-coral' : r.kind === 'paypal' ? 'bg-sky' : r.kind === 'check' ? 'bg-sun' : 'bg-leaf'}`} />
            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="mono font-bold">{r.tool}</span>
                <Chip tone={r.via === 'Agent Toolkit' ? 'sky' : r.via === 'REST' ? 'ink' : r.via === 'Claude' ? 'leaf' : r.via === 'Webhook' ? 'sun' : 'grey'}>{r.via}</Chip>
                {r.approvedBy ? <Chip tone="coral">approved by {r.approvedBy}</Chip> : null}
              </div>
              <div className="text-muted break-words">{r.demo ? <span className="italic text-ink/80">&ldquo;{r.demo}&rdquo;</span> : r.summary}</div>
              {r.paypalId || r.debugId ? <div className="mono text-xs text-ink/70 break-all">{r.paypalId ? `PayPal ID ${r.paypalId}` : ''}{r.debugId ? ` · debug ${r.debugId}` : ''}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function timeAgo(at: string | number) {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
}

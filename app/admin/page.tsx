'use client';
import { useState } from 'react';
import { Notice } from '@/components/ui';

const STEPS = [
  { step: 'class', label: '1. Seed the class', help: 'Wipes local data and issues 24 trip invoices and 16 soccer invoices through the Agent Toolkit. Takes a minute or two.' },
  { step: 'corner', label: '2. Seed Corner Hardware pledge', help: 'Opens PayPal. Log in as Corner Hardware and approve. You come back to its sponsor page.' },
  { step: 'covers', label: '3. Charge 3 seeded covers', help: 'Real sponsor absent charges from Corner Hardware on 3 families, recorded on their invoices.' },
  { step: 'office', label: '4. Record 7 office payments', help: 'Recorded as OTHER payments, marked SEEDED.' },
  { step: 'messages', label: '5. Seed 3 scripted messages', help: 'Spanish question, not attending, safeguarding. Triaged by the live agent.' },
];

export default function Admin() {
  const [token, setToken] = useState('');
  const [out, setOut] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [parents, setParents] = useState<any[]>([]);
  async function run(step: string) {
    setBusy(step); setOut('');
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ step }) });
      const j = await r.json();
      if (j.approveUrl) { window.location.href = j.approveUrl; return; }
      setOut(JSON.stringify(j, null, 2));
    } catch (e: any) { setOut(String(e.message)); }
    setBusy(null);
  }
  async function links() {
    const r = await fetch('/api/admin', { headers: { 'x-admin-token': token } });
    setParents((await r.json()).parents || []);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-black">Seed the demo</h1>
      <input className="input" type="password" placeholder="ADMIN_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
      {STEPS.map((s) => (
        <div key={s.step} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex-1"><div className="font-black">{s.label}</div><div className="text-sm text-muted">{s.help}</div></div>
          <button className="btn btn-primary" disabled={!!busy || !token} onClick={() => run(s.step)}>{busy === s.step ? 'Working…' : 'Run'}</button>
        </div>
      ))}
      <div className="card p-4">
        <div className="flex items-center justify-between"><div className="font-black">Real parent payments (by hand)</div><button className="btn btn-ghost text-sm" disabled={!token} onClick={links}>Show links</button></div>
        <div className="text-sm text-muted">Open each in a private window and pay as a parent sandbox account. Add a $2 tip on one.</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{parents.map((p, i) => <li key={i}><a className="font-bold text-coral" href={p.payUrl} target="_blank" rel="noreferrer">Invoice {i + 1}</a> <span className="text-muted">{p.status}</span></li>)}</ol>
      </div>
      {out ? <pre className="card overflow-auto p-3 text-xs">{out}</pre> : null}
      <Notice>Steps 2 and 3 need the Cover Fund app. Step 1 needs the Trips app.</Notice>
    </div>
  );
}

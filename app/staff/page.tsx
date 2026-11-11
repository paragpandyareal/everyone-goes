'use client';
import { useState } from 'react';
import { post, Notice } from '@/components/ui';

export default function Staff() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    try { await post('/api/staff', { passcode: code }); const next = new URLSearchParams(window.location.search).get('next') || ''; window.location.href = next.startsWith('/') && !next.startsWith('//') && !next.includes(':') ? next : '/coordinator'; /* only a path on this site */ } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-3xl font-black">Staff sign in</h1>
      <p className="font-semibold text-muted">For the volunteer coordinator, the treasurer and the school lead.</p>
      <input className="input" type="password" placeholder="Staff passcode" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="btn btn-primary w-full" disabled={!code} onClick={go}>Sign in</button>
      {err ? <Notice tone="coral">{err}</Notice> : null}
    </div>
  );
}

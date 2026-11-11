'use client';
import { useEffect, useState } from 'react';
import { post, Notice } from '@/components/ui';

export default function Return() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const pledge = new URLSearchParams(window.location.search).get('pledge');
    if (!pledge) { setErr('Missing pledge'); return; }
    post('/api/sponsor', { action: 'finish', pledgeId: pledge })
      .then(() => { window.location.href = `/sponsor/${pledge}?joined=1`; })
      .catch((e) => setErr(e.message));
  }, []);
  return <div className="mx-auto max-w-xl py-10">{err ? <Notice tone="coral">{err} <a className="underline" href="/sponsor/join">Try again</a></Notice> : <div className="text-lg font-black">Saving your PayPal account…</div>}</div>;
}

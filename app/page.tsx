'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePoll, post, Notice } from '@/components/ui';
import { Logo } from '@/components/nav';

const PATHS = [
  { n: 1, title: 'Become a sponsor', body: "Rosa's Bakery pledges in plain words and saves its PayPal account. Nothing is charged.", href: '/sponsor/join', who: "Log in to PayPal as Rosa's Bakery" },
  { n: 2, title: 'Ask for help privately', body: 'As a parent, send the Polish message (or your own, any language). The agent reads it, removes anything identifying and proposes a cover.', href: '/parent', who: 'No login needed' },
  { n: 3, title: 'Approve it', body: "As the coordinator, see only a code, a category and an amount. Approve, and Rosa's saved PayPal account pays $45 with Rosa absent.", href: '/coordinator', who: 'No login needed' },
  { n: 4, title: 'Watch the teacher’s grid', body: 'The last red row turns to Paid, exactly like cash at the office. The teacher never knows who.', href: '/teacher', who: 'No login needed' },
];

export default function Hub() {
  const { data } = usePoll<any>('/api/health', 30000);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true); setMsg(null);
    try { await post('/api/admin', { step: 'reset' }); setMsg('Demo reset. The six unpaid rows are fresh PayPal invoices again.'); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-6 pt-4 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Logo size={44} /><span className="text-4xl font-black tracking-tight">Everyone Goes</span></div>
          <h1 className="text-2xl font-black leading-snug md:text-3xl">School and club money through PayPal. A family that can’t pay says so privately, a local business’s saved PayPal pledge pays, and the teacher only ever sees “Paid”.</h1>
          <p className="font-semibold text-muted">Every collection is a PayPal invoice per family with a private help link. An AI agent reads help requests in any language, strips anything that could identify the family, and proposes a cover. A volunteer approves with one click and a real PayPal payment moves.</p>
          <div className="flex flex-wrap gap-2"><Link href="/teacher" className="btn btn-primary">Open the teacher’s grid</Link><Link href="/privacy" className="btn btn-ghost">Who sees what</Link></div>
        </div>
        <div className="card p-5 text-sm">
          <div className="mb-2 font-black">What is real</div>
          <p>Every invoice, payment, saved PayPal account, capture, Payout, webhook and AI call in this demo is live in the PayPal sandbox. A cover moves real sandbox money from a sponsor’s saved PayPal account. Families, businesses and messages are fictional. Some paid rows were recorded as office payments during seeding and are labelled SEEDED.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className={`chip ${data?.trips ? 'bg-leaf-soft text-leaf' : 'bg-coral-soft text-coral'}`}>Trips app {data?.trips ? 'connected' : 'not set'}</span>
            <span className={`chip ${data?.coverfund ? 'bg-leaf-soft text-leaf' : 'bg-coral-soft text-coral'}`}>Cover Fund app {data?.coverfund ? 'connected' : 'not set'}</span>
            <span className="chip bg-sky-soft text-sky">AI {data?.ai || '…'}</span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Try it in five minutes</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {PATHS.map((p) => (
            <Link key={p.n} href={p.href} className="card block p-4 hover:border-coral">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral font-black text-white">{p.n}</div>
              <div className="mt-2 font-black">{p.title}</div>
              <div className="text-sm text-muted">{p.body}</div>
              <div className="mt-2 text-xs font-bold text-sky">{p.who}</div>
            </Link>
          ))}
        </div>
        <div className="card grid gap-3 p-4 text-sm md:grid-cols-2">
          <div><div className="font-black">Sandbox logins for judges</div><p className="text-muted">The parent and Rosa’s Bakery sandbox logins are in the README on GitHub. They are test accounts with test money only.</p></div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <button className="btn btn-ghost" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset demo class'}</button>
            <div className="text-xs text-muted">Reissues the six unpaid invoices and clears new requests. Once a minute. The hosted demo can take up to a minute to wake.</div>
          </div>
        </div>
        {msg ? <Notice>{msg}</Notice> : null}
      </section>
    </div>
  );
}

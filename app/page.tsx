'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePoll, post, Notice, Chip } from '@/components/ui';
import { Logo } from '@/components/nav';

export default function Hub() {
  const { data } = usePoll<any>('/api/health', 30000);
  const { data: demo, reload } = usePoll<any>('/api/demo', 8000);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true); setMsg(null);
    try { await post('/api/admin', { step: 'reset' }); setMsg('Demo reset. The six unpaid rows are fresh PayPal invoices again.'); reload(); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }
  const heroPaid = demo?.hero && /PAID/.test(demo.hero.status || '');
  const child = demo?.hero?.child || 'Zofia';
  const PATHS = [
    { n: 1, title: 'See the teacher’s grid', body: 'Six families have not paid for Friday’s museum trip. The teacher can’t tell who forgot and who can’t afford it.', href: '/teacher', who: 'No login needed' },
    { n: 2, title: 'Ask for help privately', body: `As ${child}’s parent, send the Polish message, or your own in any language. The AI reads it and removes anything that could identify the family.`, href: '/parent', who: 'No login needed' },
    { n: 3, title: 'Approve it', body: 'As the volunteer coordinator you see only a code, a category and an amount. Approve, and a local sponsor’s saved PayPal account pays $45 with the sponsor absent.', href: '/coordinator', who: 'No login needed in this demo' },
    { n: 4, title: 'Back to the grid', body: `${child}’s row turns to Paid, looking exactly like the office cash payments. The teacher never knows who.`, href: '/teacher', who: 'No login needed' },
  ];
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-6 pt-4 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Logo size={44} /><span className="text-4xl font-black tracking-tight">Everyone Goes</span></div>
          <h1 className="text-2xl font-black leading-snug md:text-3xl">Every school trip and club fee as a PayPal invoice, with a private “we can’t pay” link. A local business’s saved PayPal pledge pays, and the teacher only ever sees “Paid”.</h1>
          <p className="font-semibold text-muted">Claude reads the help message in any language and strips out who sent it. One volunteer click charges the sponsor’s saved PayPal account and records the payment on the family’s invoice, exactly like cash handed in at the office.</p>
          <div className="flex flex-wrap gap-2"><Link href="/teacher" className="btn btn-primary">Start with the teacher’s grid</Link><Link href="/privacy" className="btn btn-ghost">Who sees what</Link></div>
        </div>
        <div className="card p-5 text-sm">
          <div className="mb-2 font-black">Live in the PayPal sandbox</div>
          <p>Every invoice, payment, saved PayPal account, capture, Payout, webhook and AI call here is live in the PayPal sandbox. A cover moves real sandbox money from a sponsor’s saved PayPal account. Families, businesses and messages are fictional. Office payments made while seeding are labelled SEEDED.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <Chip tone={data?.trips ? 'leaf' : 'coral'}>Trips app {data?.trips ? 'connected' : 'not set'}</Chip>
            <Chip tone={data?.coverfund ? 'leaf' : 'coral'}>Cover Fund app {data?.coverfund ? 'connected' : 'not set'}</Chip>
            <Chip tone="sky">AI {data?.ai || '…'}</Chip>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><div className="text-3xl font-black text-coral">93%+</div><div className="text-sm font-semibold text-muted">of teachers surveyed have students whose families can’t afford all the supplies they need.<span className="block text-xs">AdoptAClassroom.org 2025 survey</span></div></div>
        <div className="card p-4"><div className="text-3xl font-black text-coral">$895</div><div className="text-sm font-semibold text-muted">is what teachers spent of their own money on supplies in 2024–25, on average.<span className="block text-xs">AdoptAClassroom.org 2025 survey</span></div></div>
        <div className="card p-4"><div className="text-lg font-black leading-snug">“A pupil shall not be prevented from making the field trip … because of lack of sufficient funds.”</div><div className="text-sm font-semibold text-muted">California Education Code 35330(b) asks schools to bring in community groups to pay. Everyone Goes builds that into the PayPal invoice.</div></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Try it in five minutes</h2>
        {heroPaid ? <Notice>{child}’s contribution has already been covered by another visitor. Press “Reset demo class” below to start fresh.</Notice> : null}
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
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/sponsor/join" className="card block p-4 hover:border-coral">
            <div className="font-black">Optional: become a sponsor</div>
            <div className="text-sm text-muted">Pledge in plain words as Rosa’s Bakery and save its PayPal account. Nothing is charged until a family is covered. Needs the sandbox login below.</div>
          </Link>
          <Link href="/treasurer" className="card block p-4 hover:border-coral">
            <div className="font-black">Treasurer</div>
            <div className="text-sm text-muted">Settle all covers to the trip account with one PayPal Payout.</div>
          </Link>
          <Link href="/lead" className="card block p-4 hover:border-coral">
            <div className="font-black">School safeguarding lead</div>
            <div className="text-sm text-muted">Messages that suggest a child may be unsafe go here only, never to payments.</div>
          </Link>
        </div>
        <div className="card grid gap-4 p-4 text-sm md:grid-cols-2">
          <div>
            <div className="font-black">Sandbox test logins</div>
            {(data?.logins || []).length ? (
              <ul className="mt-1 space-y-1">{data.logins.map((l: any) => <li key={l.role}><b>{l.role}:</b> <span className="mono">{l.email}</span> / <span className="mono">{l.password}</span></li>)}</ul>
            ) : <p className="text-muted">Listed in the README on GitHub.</p>}
            <p className="mt-1 text-xs text-muted">PayPal sandbox test accounts with test money only.</p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <button className="btn btn-ghost" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset demo class'}</button>
            <div className="text-xs text-muted md:text-right">Reissues the six unpaid invoices and clears new requests. Once a minute. The hosted demo can take up to a minute to wake.</div>
          </div>
        </div>
        {msg ? <Notice>{msg}</Notice> : null}
      </section>
    </div>
  );
}

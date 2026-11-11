'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePoll, post, Notice, Chip } from '@/components/ui';
import { Logo } from '@/components/nav';
import { startTour } from '@/components/lens';

// What Claude does with four different private messages. A checkbox saying "I need help" could not do this.
const WHY_AI = [
  { msg: '“Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.”', lang: 'Polish', out: 'Can’t pay → proposes a $45 cover from a sponsor, replies in Polish', tone: 'coral' },
  { msg: '“We can do $20 but not the whole $45.”', lang: 'English', out: 'Can pay part → proposes a $25 part cover for the gap', tone: 'sun' },
  { msg: '“¿Puedo pagar el día 28 cuando cobro?”', lang: 'Spanish', out: 'Needs time → pauses PayPal’s reminders through the Agent Toolkit, no money moves', tone: 'sky' },
  { msg: '“He’s scared to go home when his uncle is there.”', lang: 'English', out: 'Child may be unsafe → sent only to the school’s safeguarding lead, never treated as payment', tone: 'ink' },
];

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
  const helpHref = demo?.hero?.token ? `/help/${demo.hero.token}` : '/parent';
  const live = data?.trips && data?.coverfund;
  const PATHS = [
    { n: 1, title: 'The teacher’s grid', body: 'Six families haven’t paid for Friday’s trip. Who forgot, and who can’t afford it?', href: '/teacher' },
    { n: 2, title: `Be ${child}’s parent`, body: 'Send the Polish message privately. Claude replies in Polish.', href: helpHref },
    { n: 3, title: 'Be the volunteer', body: 'See a code and $45, never a name. Approve, and a local bakery’s saved PayPal pays.', href: '/coordinator' },
    { n: 4, title: 'Back to the grid', body: `${child}’s row says Paid, like the cash rows. Nobody can tell.`, href: '/teacher' },
  ];
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-6 pt-4 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3"><Logo size={44} /><span className="text-4xl font-black tracking-tight">Everyone Goes</span></div>
          <h1 className="text-3xl font-black leading-tight md:text-4xl">No child misses the trip.<br />The teacher only sees “Paid”.</h1>
          <p className="text-lg font-semibold text-muted">School fees go out as PayPal invoices with a private “we can’t pay” link. Claude reads the message in any language, a volunteer approves, and a local sponsor’s saved PayPal account pays.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher" onClick={() => startTour(1)} className="btn btn-primary">Take the 4-step tour →</Link>
            <Link href="/privacy" className="btn btn-ghost">Who sees what</Link>
          </div>
          <div className="text-xs font-semibold text-muted">The tour turns on the <b>Judge lens</b> (top bar), which shows Claude’s reasoning and the PayPal calls that a real school never sees.</div>
        </div>
        <div className="card p-5 text-sm">
          <div className="mb-2 font-black">{!data ? 'Waking the demo… (free hosting sleeps, up to a minute)' : live ? 'Live in the PayPal sandbox' : 'PayPal sandbox not connected'}</div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <Chip tone={!data ? 'grey' : data.trips ? 'leaf' : 'coral'}>Invoices {!data ? '…' : data.trips ? 'live' : 'not set'}</Chip>
            <Chip tone={!data ? 'grey' : data.coverfund ? 'leaf' : 'coral'}>Sponsor payments {!data ? '…' : data.coverfund ? 'live' : 'not set'}</Chip>
            <Chip tone="sky">AI {data?.ai || '…'}</Chip>
          </div>
          {data ? <p className="mt-3 text-muted">{live ? 'Every invoice, payment, capture, Payout and AI call is real, in the PayPal sandbox. People and businesses are fictional.' : 'This copy runs without PayPal credentials, so no money moves.'}</p> : null}
        </div>
      </section>

      <section className="space-y-3">
        {heroPaid ? <Notice>{child}’s contribution has already been covered by another visitor. Use “Reset the demo” at the bottom of this page to start fresh.</Notice> : null}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {PATHS.map((p) => (
            <Link key={p.n} href={p.href} onClick={() => startTour(p.n)} className="card block p-4 hover:border-coral">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral font-black text-white">{p.n}</div>
              <div className="mt-2 font-black">{p.title}</div>
              <div className="text-sm text-muted">{p.body}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Why Claude, not a checkbox</h2>
        <p className="font-semibold text-muted">Families write what they mean, in their own language. Four messages, four different right answers. Code checks every money step, and a person approves every charge.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {WHY_AI.map((w) => (
            <div key={w.out} className="card p-4">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold italic">{w.msg}</div><Chip>{w.lang}</Chip></div>
              <div className="mt-2 text-sm font-bold"><Chip tone={w.tone}>→</Chip> {w.out}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><div className="text-3xl font-black text-coral">93%+</div><div className="text-sm font-semibold text-muted">of teachers surveyed have students whose families can’t afford what they need.<span className="block text-xs">AdoptAClassroom.org 2025 survey</span></div></div>
        <div className="card p-4"><div className="text-3xl font-black text-coral">$895</div><div className="text-sm font-semibold text-muted">is what teachers spent of their own money on supplies in 2024–25, on average.<span className="block text-xs">AdoptAClassroom.org 2025 survey</span></div></div>
        <div className="card p-4"><div className="font-black leading-snug">“A pupil shall not be prevented from making the field trip … because of lack of sufficient funds.”</div><div className="text-sm font-semibold text-muted">California Education Code 35330(b)</div></div>
      </section>

      <section className="card space-y-4 p-4 text-sm">
        <div className="font-black">More to try</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/sponsor/join" className="block rounded-2xl bg-cream p-3 hover:ring-2 hover:ring-coral"><div className="font-black">Become a sponsor</div><div className="text-muted">Pledge in plain words as Rosa’s Bakery. Nothing is charged until a family is covered.</div></Link>
          <Link href="/treasurer" className="block rounded-2xl bg-cream p-3 hover:ring-2 hover:ring-coral"><div className="font-black">Treasurer</div><div className="text-muted">Move all covers to the trip account with one PayPal Payout.</div></Link>
          <Link href="/lead" className="block rounded-2xl bg-cream p-3 hover:ring-2 hover:ring-coral"><div className="font-black">Safeguarding lead</div><div className="text-muted">Where a message about a child’s safety goes. Never to payments.</div></Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="font-black">Sandbox logins</div>
            {(data?.logins || []).length ? (
              <ul className="mt-1 space-y-1">{data.logins.map((l: any) => <li key={l.role}><b>{l.role}:</b> <span className="mono">{l.email}</span> / <span className="mono">{l.password}</span></li>)}</ul>
            ) : <p className="text-muted">Listed in the README on GitHub.</p>}
            <p className="mt-1 text-xs text-muted">PayPal sandbox test accounts with test money only. Please don’t change the passwords.</p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <button className="btn btn-ghost" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset the demo'}</button>
            <div className="text-xs text-muted md:text-right">Makes the six unpaid invoices fresh again. Once a minute.</div>
          </div>
        </div>
        {msg ? <Notice>{msg}</Notice> : null}
      </section>
    </div>
  );
}

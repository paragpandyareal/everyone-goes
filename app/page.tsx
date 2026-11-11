'use client';
// Home: the pitch (problem, solution, what's in it for PayPal), then the demo stage.
// On the stage, the device frame holds the real app: exactly what that person would see in a real school.
// Everything outside the frame (narration, Claude's reasoning, PayPal calls, logins, reset) exists only for judges.
import { useEffect, useRef, useState } from 'react';
import { usePoll, post, Notice, Chip, TracePanel } from '@/components/ui';
import { Logo } from '@/components/nav';

type Role = 'teacher' | 'parent' | 'coordinator' | 'sponsor' | 'treasurer' | 'lead';
const ROLES: { id: Role; label: string; person: string; who: string; cannot: string[] }[] = [
  { id: 'teacher', label: 'Teacher', person: 'Ms Rivera, the teacher', who: 'Sends the trip invoices and watches who has paid.', cannot: ['Who asked for help', 'Who was covered, or how any row was paid', 'Any message, code or sponsor'] },
  { id: 'parent', label: 'Parent', person: 'Zofia’s mum, on her phone', who: 'Opened the private link in her PayPal invoice.', cannot: ['Anyone else’s invoice or messages', 'Which sponsor paid'] },
  { id: 'coordinator', label: 'Volunteer', person: 'a PTA volunteer', who: 'No PayPal login. Approves the help Claude suggests.', cannot: ['The family’s name', 'The message or its language', 'The PayPal accounts'] },
  { id: 'sponsor', label: 'Sponsor', person: 'Rosa’s Bakery, a local sponsor', who: 'Saves its PayPal account once, with limits in plain words.', cannot: ['Which child or class was helped', 'Any family code or name'] },
  { id: 'treasurer', label: 'Treasurer', person: 'the PTA treasurer', who: 'Moves sponsor money to the trip account once a week.', cannot: ['Which family a cover was for', 'A cover from cash paid at the office'] },
  { id: 'lead', label: 'School lead', person: 'the school’s safeguarding lead', who: 'Gets messages that say a child may be unsafe.', cannot: ['Any payment information'] },
];
const EXAMPLES = [
  { label: 'Polish · can’t pay', text: 'Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.' },
  { label: 'English · can pay part', text: 'We can do $20 but not the whole $45.' },
  { label: 'Spanish · needs time', text: '¿Puedo pagar el día 28 cuando cobro?' },
  { label: 'Vietnamese · can’t pay', text: 'Xin lỗi, tháng này nhà tôi không đủ tiền đóng cho chuyến đi.' },
];
const roleOf = (p: string): Role => (p.startsWith('/help') || p === '/parent' ? 'parent' : p.startsWith('/coordinator') ? 'coordinator' : p.startsWith('/sponsor') ? 'sponsor' : p.startsWith('/treasurer') ? 'treasurer' : p.startsWith('/lead') ? 'lead' : 'teacher');

export default function Home() {
  const { data: health } = usePoll<any>('/api/health', 30000);
  const { data: demo, reload: reloadDemo } = usePoll<any>('/api/demo', 5000);
  const [role, setRole] = useState<Role>('teacher');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [src, setSrc] = useState('/teacher');
  const [path, setPath] = useState('/teacher');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  const child = demo?.hero?.child || 'Zofia';
  const helpPath = demo?.hero?.token ? `/help/${demo.hero.token}` : '/parent';
  // The hero family's own thread drives the tour: sent, Claude reading, replied, paid.
  const { data: hero } = usePoll<any>(step && demo?.hero?.token ? `/api/help/${demo.hero.token}` : null, 2000);
  const last = hero?.thread?.[hero.thread.length - 1];
  const sent = !!last;
  // Claude's decision shows on the volunteer's side first; the family's reply follows once a cover is approved.
  const { data: coord } = usePoll<any>(step === 2 || step === 3 ? '/api/coordinator' : null, 2000);
  const heroReq = (coord?.requests || []).find((x: any) => x.code === 'F-07' && !x.scripted);
  const reading = sent && (!heroReq || heroReq.status === 'NEW');
  const replied = !!heroReq && heroReq.status !== 'NEW';
  const paid = hero?.status === 'Paid';

  useEffect(() => { if (window.innerWidth < 640) setDevice('phone'); }, []);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 640); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  // Follow navigation inside the frame, so the notes always describe what is on screen.
  useEffect(() => {
    const t = setInterval(() => { try { const p = frame.current?.contentWindow?.location.pathname; if (p && p !== path) { setPath(p); setRole(roleOf(p)); } } catch {} }, 600);
    return () => clearInterval(t);
  }, [path]);

  const pathFor = (r: Role, n = step) => (r === 'parent' ? helpPath : r === 'sponsor' ? '/sponsor/join' : r === 'coordinator' && n === 3 ? '/coordinator?focus=F-07' : r === 'teacher' && n === 4 ? `/teacher?highlight=${encodeURIComponent(child)}` : `/${r}`);
  function show(r: Role, n = step) { setRole(r); setDevice(r === 'parent' || narrow ? 'phone' : 'desktop'); const p = pathFor(r, n); setSrc(p === src ? `${p}${p.includes('?') ? '&' : '?'}r=${Date.now()}` : p); }
  const TOUR_ROLES: Role[] = ['teacher', 'parent', 'coordinator', 'teacher'];
  function go(n: number) { setPaused(0); setMsg(null); if (n < 1 || n > 4) { setStep(0); return; } setStep(n); show(TOUR_ROLES[n - 1], n); }
  function pick(r: Role) { setMsg(null); if (step) { setPaused(step); setStep(0); } show(r, 0); }
  function fill(text: string) { frame.current?.contentWindow?.postMessage({ type: 'eg-fill', text }, window.location.origin); if (step !== 2) setMsg('Message placed in the phone. Press “Send privately” inside the phone.'); }
  function startTour() { stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); go(1); }
  async function reset(thenStart = false) {
    setBusy(true); setMsg(null);
    try { await post('/api/admin', { step: 'reset' }); setMsg('Demo reset. The six unpaid families have fresh PayPal invoices.'); reloadDemo(); if (thenStart) setTimeout(() => go(1), 400); else show(role, 0); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const live = health?.trips && health?.coverfund;
  const r = ROLES.find((x) => x.id === role)!;
  const heroPaidAlready = demo?.hero && /PAID/.test(demo.hero.status || '') && step > 0 && step < 3 && !sent;

  const tourCard = (
    <div className="card space-y-3 p-4" aria-live="polite">
      {step ? (
        <>
          <div className="flex items-center gap-2"><span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-extrabold text-white">Step {step} of 4</span><button onClick={() => go(0)} className="ml-auto min-h-6 px-2 text-xs font-bold text-muted hover:text-ink">End tour</button></div>
          {heroPaidAlready ? (
            <>
              <p className="font-semibold">Another visitor already helped {child}. Reset the demo to start fresh.</p>
              <button className="btn btn-primary w-full" disabled={busy} onClick={() => reset(true)}>{busy ? 'Resetting…' : 'Reset and start →'}</button>
            </>
          ) : step === 1 ? (
            <>
              <p className="font-semibold">Six families haven’t paid for Friday’s museum trip. The teacher can’t tell who forgot and who can’t afford it, and shouldn’t have to.</p>
              <button className="btn btn-primary w-full" onClick={() => go(2)}>Be {child}’s parent →</button>
            </>
          ) : step === 2 ? (
            <>
              <p className="font-semibold">{child}’s mum opens the private link in her PayPal invoice and writes in Polish.</p>
              <ol className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Dot done={sent} n={1} /><button className="btn btn-ghost !min-h-9 !py-1 text-sm" disabled={sent} onClick={() => fill(EXAMPLES[0].text)}>Fill the phone with the Polish message</button></li>
                <li className="flex items-center gap-2"><Dot done={sent} n={2} /><span>Press <b>Send privately</b> inside the phone</span></li>
                <li className="flex items-center gap-2"><Dot done={replied} n={3} busy={reading} /><span>{replied ? <b className="text-leaf">Claude read it and sent the volunteer a suggestion</b> : reading ? 'Claude is reading… about 10 seconds' : 'Claude reads it, in Polish'}</span></li>
              </ol>
              <button className={`btn w-full ${replied ? 'btn-primary pulse-ring' : 'btn-ghost'}`} onClick={() => go(3)}>Be the volunteer →</button>
            </>
          ) : step === 3 ? (
            <>
              <p className="font-semibold">Claude suggests covering $45 from a sponsor’s pledge. The volunteer sees a code and an amount, never a name. Claude’s reasoning is in the notes below.</p>
              <ol className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Dot done={paid} n={1} /><span>Press the green <b>Approve $45.00</b> button inside the app</span></li>
                <li className="flex items-center gap-2"><Dot done={paid} n={2} /><span>{paid ? <b className="text-leaf">Paid by a sponsor’s saved PayPal account</b> : 'PayPal charges the sponsor, who is not there'}</span></li>
              </ol>
              <button className={`btn w-full ${paid ? 'btn-primary pulse-ring' : 'btn-ghost'}`} onClick={() => go(4)}>See what the teacher sees →</button>
            </>
          ) : (
            <>
              <p className="font-semibold">{child}’s row says Paid, exactly like the families who paid cash at the office. Nobody can tell she was helped.</p>
              <ThreeViews child={child} message={hero?.thread?.find((m: any) => m.reply)?.text} reply={hero?.thread?.find((m: any) => m.reply)?.reply} paid={paid} />
              <div className="flex gap-2"><a href="/privacy" target="_blank" rel="noreferrer" className="btn btn-ghost flex-1 text-sm">Who sees what ↗</a><button className="btn btn-primary flex-1 text-sm" onClick={() => go(0)}>Finish</button></div>
            </>
          )}
        </>
      ) : (
        <>
          <h3 className="text-[15px] font-bold">Watch one family get help</h3>
          <p className="text-sm text-muted">Four steps, about two minutes. You play the parent and the volunteer. Real PayPal sandbox payments, real Claude.</p>
          <button onClick={() => go(paused || 1)} className="btn btn-primary w-full">{paused ? `Resume the tour (step ${paused}) →` : 'Start the 4-step tour →'}</button>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      {/* ── The pitch ─────────────────────────────────────────── */}
      <section className="space-y-6 pt-2" aria-labelledby="pitch">
        <div className="flex flex-wrap items-center gap-3">
          <Logo size={36} /><span className="text-xl font-extrabold">Everyone Goes</span>
          <span className="ml-auto flex flex-wrap gap-2 text-xs font-bold" aria-live="polite">
            <span className={`rounded-full px-2.5 py-1 ${!health ? 'bg-line text-muted' : live ? 'bg-leaf-soft text-leaf' : 'bg-coral-soft text-coral'}`}>{!health ? 'Waking the demo… (up to a minute)' : live ? '● Live on the PayPal sandbox' : 'PayPal not connected'}</span>
            <span className="rounded-full bg-sky-soft px-2.5 py-1 text-sky">Claude {health?.ai === 'claude-opus-5-5' ? 'Opus 5.5' : health?.ai || '…'}</span>
          </span>
        </div>
        <div className="max-w-3xl space-y-3">
          <h1 id="pitch" className="text-4xl font-extrabold leading-[1.05] md:text-5xl">No child misses the trip.<br /><span className="text-coral">The teacher only sees “Paid”.</span></h1>
          <p className="text-lg font-semibold text-muted">School fees go out as PayPal invoices with a private “we can’t pay” link. Claude reads the message in any language, a volunteer approves, and a local sponsor’s saved PayPal account pays. Nobody is singled out.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={startTour} className="btn btn-primary">Watch one family get help · 2 min ↓</button>
            <a href="/privacy" target="_blank" rel="noreferrer" className="btn btn-ghost">Who sees what ↗<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="card p-5">
            <div className="eyebrow">The problem</div>
            <h2 className="mt-1 text-xl font-extrabold">Families who can’t pay stay silent</h2>
            <p className="mt-2 text-sm text-muted">Asking for help in front of a teacher feels like begging, so children quietly miss out, or teachers pay from their own pocket.</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><b className="text-lg">93%+</b> of teachers have students whose families can’t afford what they need <span className="text-xs text-muted">(AdoptAClassroom.org, 2025)</span></li>
              <li><b className="text-lg">$895</b> spent by teachers from their own money in 2024–25, on average <span className="text-xs text-muted">(same survey)</span></li>
              <li><b>California law</b> already says no pupil may miss a field trip for lack of funds <span className="text-xs text-muted">(Education Code 35330)</span></li>
            </ul>
          </article>
          <article className="card p-5">
            <div className="eyebrow">How we solve it</div>
            <h2 className="mt-1 text-xl font-extrabold">Help hidden inside a normal payment</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                ['PayPal invoice', 'Every family gets the same invoice, with a private “can’t pay?” link.'],
                ['Claude reads it', 'Any language. Names and details are removed first. It suggests a cover, a part cover, more time, or the safeguarding lead.'],
                ['A volunteer approves', 'They see a code and $45. Never a name or the message.'],
                ['A sponsor’s PayPal pays', 'A local business saved its PayPal once. The payment is recorded like cash at the office.'],
              ].map(([t, d], i) => <li key={t} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white">{i + 1}</span><span><b>{t}.</b> <span className="text-muted">{d}</span></span></li>)}
            </ol>
          </article>
          <article className="card p-5">
            <div className="eyebrow">What’s in it for PayPal</div>
            <h2 className="mt-1 text-xl font-extrabold">A trusted channel into every class</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li><b>New customers through the school letter.</b> <span className="text-muted">Each collection puts about 25 families and a local business on PayPal.</span></li>
              <li><b>Saved accounts, repeat payments.</b> <span className="text-muted">Sponsors save PayPal once (Vault) and are charged per child helped, while away.</span></li>
              <li><b>The Agent Toolkit doing real work.</b> <span className="text-muted">Claude creates, reads, pauses and records PayPal invoices, with code checks and a human approving every charge.</span></li>
              <li><b>Revenue, as a scenario.</b> <span className="text-muted">At 10,000 organisers, about $3.9M a year in invoice fees. The bigger prize is the channel. Families never pay a fee.</span></li>
            </ul>
          </article>
        </div>
      </section>

      {/* ── The demo stage ─────────────────────────────────────── */}
      <section id="stage" ref={stageRef} aria-labelledby="stage-title" className="stage-bg on-dark scroll-mt-4 rounded-[28px] p-3 text-white md:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="stage-title" className="text-2xl font-extrabold">See it work</h2>
          <p className="text-sm font-semibold text-white/75">The bright screen is the real app. The amber notes are for judges only.</p>
          <a href="#notes" className="sr-only focus:not-sr-only">Skip to the notes</a>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/60">Play as</span>
          <div role="group" aria-label="Whose screen" className="flex flex-wrap gap-1">
            {ROLES.map((x) => <button key={x.id} aria-pressed={role === x.id} onClick={() => pick(x.id)} className={`min-h-9 rounded-full px-3 text-sm font-bold ${role === x.id ? 'bg-white text-ink' : 'bg-white/10 text-white/85 hover:bg-white/20'}`}>{x.label}</button>)}
          </div>
          <div role="group" aria-label="Device" className="ml-auto hidden rounded-full bg-white/10 p-1 text-xs font-bold sm:flex">
            {(['desktop', 'phone'] as const).map((d) => <button key={d} aria-pressed={device === d} onClick={() => setDevice(d)} className={`min-h-7 rounded-full px-3 ${device === d ? 'bg-white text-ink' : 'text-white/80'}`}>{d === 'desktop' ? 'Desktop' : 'Phone'}</button>)}
          </div>
        </div>

        <div className="mb-3 text-ink lg:hidden">{tourCard}</div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="mb-2 text-sm font-semibold text-white/85">You are <b className="text-white">{r.person}</b>. This is exactly what they see.</div>
            {device === 'desktop' ? (
              <div className="overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_60px_-24px_rgba(0,0,0,.6)]">
                <div className="flex items-center gap-2 bg-[#2d2d44] px-3 py-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" /><span className="mono ml-2 flex-1 truncate rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/75">everyonegoes.school{path}</span></div>
                <iframe ref={frame} key={src} src={src} title={`The app: ${r.person}’s screen`} className="block h-[70vh] min-h-[420px] w-full bg-cream lg:h-[calc(100vh-150px)] lg:min-h-[640px]" />
              </div>
            ) : (
              <div className="flex justify-center py-1">
                <div className="rounded-[44px] border-[10px] border-[#0d0d18] bg-[#0d0d18] shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
                  <div className="mx-auto mb-1 h-4 w-24 rounded-b-2xl bg-[#0d0d18]" />
                  <iframe ref={frame} key={src + 'p'} src={src} title={`The app on a phone: ${r.person}’s screen`} className="block h-[min(740px,78vh)] w-[min(375px,calc(100vw-64px))] rounded-[30px] bg-cream" />
                </div>
              </div>
            )}
          </div>

          <aside id="notes" aria-label="Notes for judges" className="space-y-3 rounded-[20px] border-2 border-dashed border-[#e0b25a] bg-sun-soft p-3 text-ink">
            <div className="flex items-center gap-2"><span className="rounded-full bg-sun px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">Notes for judges</span><span className="text-xs font-bold text-ink/75">Real users never see this.</span></div>
            <div className="hidden lg:block">{tourCard}</div>
            {msg ? <Notice>{msg}</Notice> : null}

            {role === 'parent' && step !== 2 ? (
              <div className="card p-4 text-sm">
                <h3 className="text-[15px] font-bold">Try a message</h3>
                <p className="text-muted">Puts the text in the phone. You still press Send.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x.label} onClick={() => fill(x.text)} className="chip min-h-8 bg-sky-soft px-3 text-sky hover:ring-2 hover:ring-sky">{x.label}</button>)}</div>
              </div>
            ) : null}

            <div className="card p-4 text-sm">
              <h3 className="text-[15px] font-bold">{r.label}: {r.who}</h3>
              <div className="eyebrow mt-2">Can never see</div>
              <ul className="mt-1 space-y-0.5 text-muted">{r.cannot.map((c) => <li key={c} className="flex gap-2"><span aria-hidden className="text-coral">✕</span>{c}</li>)}</ul>
            </div>

            {role === 'sponsor' ? <SponsorNote logins={health?.logins || []} /> : null}
            <BehindScenes role={role} />

            <details className="card p-4 text-sm">
              <summary className="cursor-pointer list-none font-bold">Why Claude, not a checkbox <span aria-hidden>▸</span></summary>
              <ul className="mt-2 space-y-1.5 text-muted">
                <li><b className="text-ink">Can’t pay</b>, in any language → a full cover, reply in their language</li>
                <li><b className="text-ink">Can pay part</b> → a part cover for the gap only</li>
                <li><b className="text-ink">Needs until payday</b> → pauses PayPal’s reminders through the Agent Toolkit; no money moves</li>
                <li><b className="text-ink">A child may be unsafe</b> → only to the safeguarding lead, never a payment matter</li>
                <li>Claude can’t move money. Code checks every amount; a person approves every charge.</li>
              </ul>
            </details>

            <div className="card space-y-2 p-4 text-sm">
              <h3 className="text-[15px] font-bold">Demo controls</h3>
              <div className="flex flex-wrap items-center gap-2"><button className="btn btn-ghost !min-h-9 !py-1.5 text-sm" disabled={busy} onClick={() => reset()}>{busy ? 'Resetting…' : 'Reset the demo'}</button><span className="text-xs text-muted">Fresh unpaid invoices. Once a minute.</span></div>
              {(health?.logins || []).length ? (
                <details><summary className="cursor-pointer list-none text-xs font-bold text-coral">PayPal sandbox logins <span aria-hidden>▸</span></summary>
                  <ul className="mt-1 space-y-1 text-xs">{health.logins.map((l: any) => <li key={l.role}><b>{l.role}:</b> <span className="mono">{l.email}</span> / <span className="mono">{l.password}</span></li>)}</ul>
                </details>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
      <p className="pb-4 text-center text-xs text-muted">Concept demo for the PayPal AI Hackathon. PayPal sandbox only; every person, school and business is fictional.</p>
    </div>
  );
}

function Dot({ done, n, busy }: { done: boolean; n: number; busy?: boolean }) {
  if (busy) return <span aria-label="working" className="spin inline-block h-6 w-6 shrink-0 rounded-full border-[3px] border-line border-t-ink" />;
  return <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${done ? 'bg-leaf text-white' : 'bg-line text-ink'}`}>{done ? <span aria-label="done">✓</span> : n}</span>;
}

// The payoff: one moment, as three people saw it.
function ThreeViews({ child, message, reply, paid }: { child: string; message?: string; reply?: string; paid: boolean }) {
  const views = [
    { who: 'Parent', sees: message ? `“${message.slice(0, 48)}${message.length > 48 ? '…' : ''}” → “all taken care of”, in Polish` : 'Her message, and a reply in her language', not: 'Which sponsor paid' },
    { who: 'Volunteer', sees: 'F-07 · hardship · cover $45 · Approve', not: 'Her name, her words, her language' },
    { who: 'Teacher', sees: `${child} · ${paid ? '✓ Paid' : 'Paid'}`, not: 'That she asked for help at all' },
  ];
  return (
    <div className="space-y-2">
      <div className="eyebrow">One moment, three views</div>
      {views.map((v) => (
        <div key={v.who} className="fade-in rounded-xl bg-cream p-2.5 text-sm">
          <div className="text-xs font-extrabold text-muted">{v.who}</div>
          <div dir="auto" className="font-semibold">{v.sees}</div>
          <div className="text-xs text-muted"><span aria-hidden className="text-coral">✕ </span><span className="line-through decoration-coral/70">{v.not}</span></div>
        </div>
      ))}
      {reply ? null : null}
    </div>
  );
}

function SponsorNote({ logins }: { logins: any[] }) {
  const rosa = logins.find((l) => /sponsor/i.test(l.role));
  return (
    <div className="card p-4 text-sm">
      <h3 className="text-[15px] font-bold">Becoming a sponsor</h3>
      <p className="text-muted">Claude reads the pledge in plain words. PayPal then opens in a new tab to save the account (PayPal does not load inside a frame). Nothing is charged until a volunteer approves a cover.</p>
      {rosa ? <div className="mt-2 text-xs"><b>Log in to PayPal as:</b> <span className="mono">{rosa.email}</span> / <span className="mono">{rosa.password}</span></div> : null}
    </div>
  );
}

// Live material for the screen on show: Claude's reasoning and every PayPal call, with IDs.
function BehindScenes({ role }: { role: Role }) {
  const url = role === 'teacher' ? '/api/teacher' : role === 'treasurer' ? '/api/treasurer' : role === 'coordinator' || role === 'parent' ? '/api/coordinator' : null;
  const { data } = usePoll<any>(url, 2500);
  const reqs: any[] = data?.requests || [];
  const pick = role === 'parent' ? reqs.find((x) => x.code === 'F-07' && !x.scripted) : reqs.find((x) => x.code === 'F-07' && !x.scripted) || reqs.find((x) => x.status === 'PROPOSED') || reqs.find((x) => !x.scripted) || reqs[0];
  const { data: t } = usePoll<any>((role === 'coordinator' || role === 'parent') && pick ? `/api/coordinator?request=${pick.id}` : null, 2500);
  if (role === 'teacher') return <TracePanel rows={data?.trace || []} title="PayPal calls for this class" empty="Waiting for activity…" newestFirst cap={5} />;
  if (role === 'treasurer') return <TracePanel rows={data?.trace || []} title="PayPal Payouts calls" empty="No payouts yet." newestFirst cap={5} />;
  if (role === 'coordinator' || role === 'parent') {
    return <TracePanel rows={t?.trace?.rows || []} model={t?.trace?.model} mode={t?.trace?.mode} title={pick ? `What Claude and PayPal did · ${pick.code}` : 'What Claude and PayPal did'} empty={role === 'parent' ? 'Send a message from the phone to see Claude work, step by step.' : 'Nothing yet.'} />;
  }
  if (role === 'lead') return <div className="card p-4 text-sm text-muted">A message that suggests a child may be unsafe goes only here, with the child’s name so the lead can act. Claude routes it, and a keyword safety net in 8 languages also copies it here in case the AI misses one. The family gets a neutral “we have received your message”.</div>;
  return null;
}

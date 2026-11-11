'use client';
// The demo stage. Inside the device frame: the real app, exactly what that person would see in a real school.
// Outside the frame: material that exists only for judges (narration, Claude's reasoning, PayPal calls, logins, reset).
import { useEffect, useRef, useState } from 'react';
import { usePoll, post, Notice, Chip, TracePanel } from '@/components/ui';
import { Logo } from '@/components/nav';

type Role = 'teacher' | 'parent' | 'coordinator' | 'sponsor' | 'treasurer' | 'lead';
const ROLES: { id: Role; label: string; who: string; cannot: string[] }[] = [
  { id: 'teacher', label: 'Teacher', who: 'Ms Rivera, Room 12. Sends the trip invoices and watches who has paid.', cannot: ['Who asked for help', 'Who was covered, or how any row was paid', 'Any message, code or sponsor'] },
  { id: 'parent', label: 'Parent', who: 'Zofia’s mum, on her phone, from the private link in her PayPal invoice.', cannot: ['Anyone else’s invoice or messages', 'Which sponsor paid'] },
  { id: 'coordinator', label: 'Volunteer', who: 'A PTA volunteer with no PayPal login. Approves the help Claude suggests.', cannot: ['The family’s name', 'The message or its language', 'The PayPal accounts'] },
  { id: 'sponsor', label: 'Sponsor', who: 'Rosa’s Bakery. Saves its PayPal account once, with limits in plain words.', cannot: ['Which child or class was helped', 'Any family code or name'] },
  { id: 'treasurer', label: 'Treasurer', who: 'The PTA treasurer. Moves sponsor money to the trip account once a week.', cannot: ['Which family a cover was for', 'A cover from cash paid at the office'] },
  { id: 'lead', label: 'School lead', who: 'The school’s safeguarding lead. Gets messages that say a child may be unsafe.', cannot: ['Any payment information'] },
];
const EXAMPLES = [
  { label: 'Polish: can’t pay', text: 'Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.' },
  { label: 'English: can pay part', text: 'We can do $20 but not the whole $45.' },
  { label: 'Spanish: needs time', text: '¿Puedo pagar el día 28 cuando cobro?' },
  { label: 'Vietnamese: can’t pay', text: 'Xin lỗi, tháng này nhà tôi không đủ tiền đóng cho chuyến đi.' },
];
const TOUR: { role: Role; text: string; next: string }[] = [
  { role: 'teacher', text: 'Six families haven’t paid for Friday’s museum trip. The teacher can’t tell who forgot and who can’t afford it, and shouldn’t have to.', next: 'Be Zofia’s parent' },
  { role: 'parent', text: 'Zofia’s mum opens the private link from her PayPal invoice. Press “Polish: can’t pay” below to fill the box, then press “Send privately” inside the phone.', next: 'Be the volunteer' },
  { role: 'coordinator', text: 'Claude read the message and suggests $45 from a sponsor’s pledge. The volunteer sees only a code and an amount. Press “Approve $45.00” inside the app. Claude’s reasoning is below.', next: 'Back to the teacher' },
  { role: 'teacher', text: 'Zofia’s row now says Paid, exactly like the families who paid cash at the office. Nobody can tell she was helped.', next: 'Finish' },
];
const roleOf = (p: string): Role => (p.startsWith('/help') || p === '/parent' ? 'parent' : p.startsWith('/coordinator') ? 'coordinator' : p.startsWith('/sponsor') ? 'sponsor' : p.startsWith('/treasurer') ? 'treasurer' : p.startsWith('/lead') ? 'lead' : 'teacher');

export default function Stage() {
  const { data: health } = usePoll<any>('/api/health', 30000);
  const { data: demo, reload: reloadDemo } = usePoll<any>('/api/demo', 8000);
  const [role, setRole] = useState<Role>('teacher');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [src, setSrc] = useState('/teacher');
  const [path, setPath] = useState('/teacher');
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const helpPath = demo?.hero?.token ? `/help/${demo.hero.token}` : '/parent';
  const pathFor = (r: Role) => (r === 'parent' ? helpPath : r === 'sponsor' ? '/sponsor/join' : `/${r}`);
  function show(r: Role) { setRole(r); setDevice(r === 'parent' ? 'phone' : 'desktop'); setSrc(pathFor(r) + (src === pathFor(r) ? `?r=${Date.now()}` : '')); }

  // Follow navigation inside the frame, so the panel always describes what is on screen.
  useEffect(() => {
    const t = setInterval(() => { try { const p = frame.current?.contentWindow?.location.pathname; if (p && p !== path) { setPath(p); setRole(roleOf(p)); } } catch {} }, 600);
    return () => clearInterval(t);
  }, [path]);

  function fill(text: string) { frame.current?.contentWindow?.postMessage({ type: 'eg-fill', text }, window.location.origin); }
  function next() {
    if (step >= TOUR.length) { setStep(0); return; }
    const n = step + 1;
    if (n > TOUR.length) { setStep(0); return; }
    setStep(n); show(TOUR[n - 1].role);
  }
  function startTour() { setStep(1); show('teacher'); }
  async function reset() {
    setBusy(true); setMsg(null);
    try { await post('/api/admin', { step: 'reset' }); setMsg('Demo reset. The six unpaid rows are fresh PayPal invoices again.'); reloadDemo(); show(role); } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const live = health?.trips && health?.coverfund;
  const r = ROLES.find((x) => x.id === role)!;
  const tour = step ? TOUR[step - 1] : null;
  const heroPaid = demo?.hero && /PAID/.test(demo.hero.status || '');

  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      {/* Stage header: judges only */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-black"><Logo size={30} /><span className="text-lg">Everyone Goes</span></div>
        <div className="min-w-0 flex-1 text-sm font-semibold text-white/80">No child misses the trip. The teacher only sees “Paid”. <span className="text-white/60">Concept demo on the PayPal sandbox; people and businesses are fictional.</span></div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className={`rounded-full px-2 py-0.5 ${!health ? 'bg-white/15' : live ? 'bg-leaf text-white' : 'bg-coral text-white'}`}>{!health ? 'Waking the demo…' : live ? 'PayPal sandbox live' : 'PayPal not set'}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">AI {health?.ai || '…'}</span>
          <a href="/privacy" target="_blank" rel="noreferrer" className="rounded-full bg-white px-3 py-1 text-ink">Who sees what ↗</a>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* The app: what real people see */}
        <section className="rounded-3xl border-2 border-line bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-leaf px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">The app</span>
            <span className="text-sm font-bold text-muted">Exactly what this person sees. Nothing else.</span>
            <div className="ml-auto flex rounded-full bg-cream p-1 text-xs font-extrabold">
              {(['desktop', 'phone'] as const).map((d) => <button key={d} onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 ${device === d ? 'bg-ink text-white' : 'text-muted'}`}>{d === 'desktop' ? 'Desktop' : 'Phone'}</button>)}
            </div>
          </div>
          <div className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {ROLES.map((x) => <button key={x.id} onClick={() => { setStep(0); show(x.id); }} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold ${role === x.id ? 'bg-coral text-white' : 'bg-cream text-muted hover:text-ink'}`}>{x.label}</button>)}
          </div>
          {device === 'desktop' ? (
            <div className="overflow-hidden rounded-2xl border-2 border-ink/80 shadow-sm">
              <div className="flex items-center gap-2 bg-ink px-3 py-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" /><span className="h-2.5 w-2.5 rounded-full bg-sun" /><span className="h-2.5 w-2.5 rounded-full bg-leaf" /><span className="mono ml-2 flex-1 truncate rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80">everyonegoes.school{path}</span></div>
              <iframe ref={frame} key={src} src={src} title="The app" className="block h-[calc(100vh-230px)] min-h-[620px] w-full bg-cream" />
            </div>
          ) : (
            <div className="flex justify-center py-2">
              <div className="rounded-[46px] border-[12px] border-ink bg-ink shadow-xl">
                <div className="mx-auto mb-1 h-4 w-24 rounded-b-2xl bg-ink" />
                <iframe ref={frame} key={src + 'p'} src={src} title="The app on a phone" className="block h-[740px] w-[375px] max-w-[calc(100vw-80px)] rounded-[30px] bg-cream" />
              </div>
            </div>
          )}
        </section>

        {/* Behind the scenes: judges only */}
        <aside className="space-y-3 rounded-3xl border-2 border-dashed border-sun bg-sun-soft p-3">
          <div className="flex items-center gap-2"><span className="rounded-full bg-sun px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white">Behind the scenes</span><span className="text-xs font-bold text-ink/70">For judges only. Never part of the app.</span></div>

          <div className="card space-y-2 p-3">
            {tour ? (
              <>
                <div className="flex items-center gap-2"><span className="rounded-full bg-coral px-2 py-0.5 text-xs font-extrabold text-white">Step {step} of 4</span><button onClick={() => setStep(0)} className="ml-auto text-xs font-bold text-muted hover:text-ink">End tour</button></div>
                <div className="font-semibold">{tour.text}</div>
                <button onClick={next} className="btn btn-primary w-full">{tour.next} →</button>
              </>
            ) : (
              <>
                <div className="font-black">See it work in four steps</div>
                <div className="text-sm text-muted">A family can’t pay, asks privately in Polish, a volunteer approves, a local sponsor’s saved PayPal pays, and the teacher only sees Paid.</div>
                <button onClick={startTour} className="btn btn-primary w-full">Start the 4-step tour →</button>
              </>
            )}
            {heroPaid && tour && step <= 2 ? <Notice>Zofia’s contribution was already covered by another visitor. Press “Reset the demo” below to start fresh.</Notice> : null}
          </div>

          <div className="card p-3 text-sm">
            <div className="font-black">{r.label}</div>
            <div className="text-muted">{r.who}</div>
            <div className="mt-2 text-xs font-extrabold uppercase text-muted">Can never see</div>
            <ul className="mt-1 list-disc pl-5 text-muted">{r.cannot.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>

          {role === 'parent' ? (
            <div className="card p-3 text-sm">
              <div className="font-black">Try a message</div>
              <div className="text-muted">Fills the box in the phone. You press Send inside the app.</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x.label} onClick={() => fill(x.text)} className="chip bg-sky-soft text-sky hover:ring-2 hover:ring-sky">{x.label}</button>)}</div>
            </div>
          ) : null}
          {role === 'sponsor' ? <SponsorNote logins={health?.logins || []} /> : null}
          <BehindScenes role={role} />

          <details className="card p-3 text-sm">
            <summary className="cursor-pointer list-none font-black">Why Claude, not a checkbox ▸</summary>
            <ul className="mt-2 space-y-1.5 text-muted">
              <li><b className="text-ink">Can’t pay</b> (any language) → a full cover from a sponsor, reply in their language</li>
              <li><b className="text-ink">Can pay part</b> → a part cover for the gap only</li>
              <li><b className="text-ink">Needs until payday</b> → pauses PayPal’s reminders through the Agent Toolkit; no money moves</li>
              <li><b className="text-ink">A child may be unsafe</b> → only to the school’s safeguarding lead, never a payment matter</li>
              <li>Claude can’t move money. Code checks every amount, and a person approves every charge.</li>
            </ul>
          </details>

          <div className="card space-y-2 p-3 text-sm">
            <div className="font-black">Demo controls</div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-ghost !py-1.5 text-sm" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset the demo'}</button>
              <span className="text-xs text-muted">Fresh unpaid invoices. Once a minute.</span>
            </div>
            {(health?.logins || []).length ? (
              <details><summary className="cursor-pointer list-none text-xs font-bold text-coral">PayPal sandbox logins ▸</summary>
                <ul className="mt-1 space-y-1 text-xs">{health.logins.map((l: any) => <li key={l.role}><b>{l.role}:</b> <span className="mono">{l.email}</span> / <span className="mono">{l.password}</span></li>)}</ul>
              </details>
            ) : null}
            {msg ? <Notice>{msg}</Notice> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SponsorNote({ logins }: { logins: any[] }) {
  const rosa = logins.find((l) => /sponsor/i.test(l.role));
  return (
    <div className="card p-3 text-sm">
      <div className="font-black">Becoming a sponsor</div>
      <div className="text-muted">Claude reads the pledge in plain words. PayPal then opens in a new tab to save the account (PayPal does not load inside a frame). Nothing is charged until a volunteer approves a cover.</div>
      {rosa ? <div className="mt-2 text-xs"><b>Log in to PayPal as:</b> <span className="mono">{rosa.email}</span> / <span className="mono">{rosa.password}</span></div> : null}
    </div>
  );
}

// Live material for the role on screen: Claude's reasoning and every PayPal call, with IDs.
function BehindScenes({ role }: { role: Role }) {
  const url = role === 'teacher' ? '/api/teacher' : role === 'treasurer' ? '/api/treasurer' : role === 'coordinator' || role === 'parent' ? '/api/coordinator' : null;
  const { data } = usePoll<any>(url, 2500);
  const reqs: any[] = data?.requests || [];
  const pick = role === 'parent' ? reqs.find((x) => x.code === 'F-07' && !x.scripted) : reqs.find((x) => x.status === 'PROPOSED') || reqs.find((x) => !x.scripted) || reqs[0];
  const { data: t } = usePoll<any>((role === 'coordinator' || role === 'parent') && pick ? `/api/coordinator?request=${pick.id}` : null, 2500);
  if (role === 'teacher') return <TracePanel rows={data?.trace || []} title="PayPal calls for this class" empty="Waiting for activity…" />;
  if (role === 'treasurer') return <TracePanel rows={data?.trace || []} title="PayPal Payouts calls" empty="No payouts yet." />;
  if (role === 'coordinator' || role === 'parent') {
    return <TracePanel rows={t?.trace?.rows || []} model={t?.trace?.model} mode={t?.trace?.mode} title={pick ? `What Claude and PayPal did · ${pick.code}` : 'What Claude and PayPal did'} empty={role === 'parent' ? 'Send a message from the phone to see Claude work, step by step.' : 'Nothing yet.'} />;
  }
  if (role === 'lead') return <div className="card p-3 text-sm text-muted">A message that suggests a child may be unsafe goes only here, with the child’s name so the lead can act. Claude routes it, and a keyword safety net in 8 languages also copies it here in case the AI misses one. The family gets a neutral “we have received your message”.</div>;
  return null;
}

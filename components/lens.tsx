'use client';
// The judge lens. The real app shows each role only what it needs. In the public demo a judge can switch the lens on
// to see what is normally hidden: the AI's reasoning, the step by step agent and PayPal trace, and PayPal IDs.
// The server only sends that material while DEMO_MODE is on; a real school (DEMO_MODE=0) never receives it.
import { createContext, useContext, useEffect, useState } from 'react';

type Lens = { demo: boolean; on: boolean; set: (v: boolean) => void };
const Ctx = createContext<Lens>({ demo: false, on: false, set: () => {} });
export const useLens = () => useContext(Ctx);

export function LensProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    try { setOn(localStorage.getItem('eg-lens') === '1'); } catch {}
    fetch('/api/health').then((r) => r.json()).then((h) => setDemo(!!h.demo)).catch(() => {});
  }, []);
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem('eg-lens', v ? '1' : '0'); } catch {} };
  return <Ctx.Provider value={{ demo, on: demo && on, set }}>{children}</Ctx.Provider>;
}

export function DemoBanner() {
  const { demo, on, set } = useLens();
  return (
    <div className="bg-ink px-4 py-1.5 text-xs font-bold text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span>Concept demo. PayPal sandbox only. All people and businesses are fictional.</span>
        {demo ? (
          <button onClick={() => set(!on)} aria-pressed={on} className={`inline-flex items-center gap-2 rounded-full px-3 py-0.5 ${on ? 'bg-sun text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}>
            <span className={`relative inline-block h-3.5 w-6 rounded-full ${on ? 'bg-white/40' : 'bg-white/30'}`}><span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? 'left-3' : 'left-0.5'}`} /></span>
            Judge lens {on ? 'on' : 'off'}
            <span className="hidden font-semibold sm:inline">{on ? '· showing what staff never see' : '· see the AI thinking and PayPal calls'}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Wraps anything that only exists for judges. Hidden unless the lens is on.
export function LensOnly({ children, note }: { children: React.ReactNode; note?: string }) {
  const { on } = useLens();
  if (!on) return null;
  return (
    <section className="rounded-2xl border-2 border-dashed border-sun bg-sun-soft p-2">
      <div className="px-2 pb-2 pt-1 text-xs font-extrabold text-ink">
        <span className="mr-2 rounded-full bg-sun px-2 py-0.5 text-white">Judge lens · demo only</span>
        <span className="font-semibold text-ink/80">{note || 'A real school never sees this panel. It is here so you can see how the app works.'}</span>
      </div>
      {children}
    </section>
  );
}

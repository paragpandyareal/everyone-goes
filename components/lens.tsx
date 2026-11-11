'use client';
// Demo stage support. The real app pages run inside a device frame on the demo stage (the home page). Inside the frame
// they show only what that person would see in a real school: no demo banner, no role switcher, no judge material.
// Everything that exists only for judges (AI reasoning, PayPal call trace, narration) lives outside the frame.
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Demo = { framed: boolean | null };
const Ctx = createContext<Demo>({ framed: null });
export const useFramed = () => useContext(Ctx).framed;
// Kept for older call sites: judge material never renders inside the real pages now.
export const useLens = () => ({ on: false, demo: false, set: (_: boolean) => {} });
export function LensOnly(_: { children?: React.ReactNode; note?: string }) { return null; }

export function LensProvider({ children }: { children: React.ReactNode }) {
  const [framed, setFramed] = useState<boolean | null>(null);
  useEffect(() => {
    let f = false;
    try { f = window.self !== window.top; } catch { f = true; }
    setFramed(f);
    document.documentElement.dataset.framed = f ? '1' : '0';
  }, []);
  return <Ctx.Provider value={{ framed }}>{children}</Ctx.Provider>;
}

// Shown only when a real page is opened directly (not in the stage's frame), so nobody mistakes the demo for a live school.
export function DemoBanner() {
  const framed = useFramed();
  const path = usePathname();
  if (framed !== false || path === '/') return null;
  return (
    <div className="bg-ink px-4 py-1.5 text-center text-xs font-bold text-white">
      Concept demo. PayPal sandbox only. All people and businesses are fictional. <a href="/" className="ml-1 underline">Open the demo stage →</a>
    </div>
  );
}

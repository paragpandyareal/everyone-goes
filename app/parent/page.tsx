'use client';
import Link from 'next/link';
import { usePoll, Notice } from '@/components/ui';

export default function ParentPicker() {
  const { data } = usePoll<any>('/api/demo', 10000);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-black">Parent view</h1>
      <p className="text-muted font-semibold">A real parent only ever has their own link, printed on the paper letter and in the PayPal invoice note. For the demo, pick a family.</p>
      {!data?.seeded ? <Notice>The demo class has not been seeded yet.</Notice> : (
        <div className="grid gap-3">
          {data.hero ? (
            <Link href={`/help/${data.hero.token}`} className="card block p-4 hover:border-coral">
              <div className="font-black">Ask for help privately</div>
              <div className="text-sm text-muted">{data.hero.child}’s family. Try the Polish message, or write your own in any language.</div>
            </Link>
          ) : null}
          {data.payer ? (
            <Link href={`/help/${data.payer.token}`} className="card block p-4 hover:border-coral">
              <div className="font-black">Pay on PayPal</div>
              <div className="text-sm text-muted">{data.payer.child}’s family. Opens PayPal’s own invoice page. Use the parent sandbox login from the hub.</div>
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { usePoll, Chip } from '@/components/ui';

export default function Sponsors() {
  const { data } = usePoll<any>('/api/sponsor', 5000);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-3xl font-black">Local sponsors</h1>
      <p className="font-semibold text-muted">A local business pledges a capped amount and saves its PayPal account once. Each time a family asks for help and a volunteer approves, the business’s PayPal account pays that one contribution. Nothing is charged up front.</p>
      <Link href="/sponsor/join" className="btn btn-primary">Become a sponsor</Link>
      <div className="grid gap-3">
        {(data?.pledges || []).map((p: any) => (
          <Link key={p.id} href={`/sponsor/${p.id}`} className="card flex items-center justify-between p-4 hover:border-coral">
            <span className="font-black">{p.display_name}</span><Chip tone={p.status === 'ACTIVE' ? 'leaf' : 'grey'}>{p.status.toLowerCase()}</Chip>
          </Link>
        ))}
      </div>
    </div>
  );
}

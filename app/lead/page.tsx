'use client';
import { usePoll, timeAgo } from '@/components/ui';

export default function Lead() {
  const { data } = usePoll<any>('/api/lead', 4000);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm font-extrabold text-muted">School designated safeguarding lead</div>
      <h1 className="text-3xl font-black">Concerns routed to you</h1>
      <p className="font-semibold text-muted">Messages that suggest a child may be unsafe are sent here only. They are never treated as a payment matter and never shown to the coordinator.</p>
      {(data?.items || []).length === 0 ? <div className="card p-4 text-muted">Nothing routed.</div> : null}
      {(data?.items || []).map((i: any) => (
        <div key={i.id} className="card whitespace-pre-wrap p-4"><div className="mb-1 text-xs font-bold text-muted">{timeAgo(i.created_at)}</div>{i.text_redacted}</div>
      ))}
    </div>
  );
}

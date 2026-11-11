'use client';
import { usePoll, timeAgo } from '@/components/ui';

export default function Lead() {
  const { data } = usePoll<any>('/api/lead', 4000);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm font-extrabold text-muted">School designated safeguarding lead</div>
      <h1 className="text-3xl font-black">Concerns routed to you</h1>
      <p className="font-semibold text-muted">Messages that suggest a child may be unsafe come here, with the child’s name so you can act. The volunteer coordinator never sees them, and they are never treated as a payment matter. The family was sent only a neutral “we have received your message”.</p>
      {(data?.items || []).length === 0 ? <div className="card p-4 text-muted">Nothing routed.</div> : null}
      {(data?.items || []).map((i: any) => (
        <div key={i.id} className="card whitespace-pre-wrap p-4 [overflow-wrap:anywhere]"><div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-black">{i.family ? `${i.family.child} · parent or carer ${i.family.parent}` : 'Family not linked'}</span>{i.collection ? <span className="text-xs font-bold text-muted">from the help link on “{i.collection}”</span> : null}<span className="ml-auto text-xs font-bold text-muted">{timeAgo(i.created_at)}</span></div>{i.text_redacted}</div>
      ))}
    </div>
  );
}

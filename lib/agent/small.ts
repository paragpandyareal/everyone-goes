// The small single call AI jobs: one sentence -> collection draft, plain words pledge -> caps and conditions, shortfall -> sponsor ask.
import { structured, liveMode, underLimit, startRun, traceRun, endRun } from './claude';
import { COLLECTION_SYSTEM, PLEDGE_SYSTEM, SHORTFALL_SYSTEM } from './prompts';

export type Draft = { title: string; kind: 'TRIP' | 'CLUB_FEE'; amount_cents: number; due_date: string | null; item_name: string; warning: string | null };
const DRAFT_SCHEMA = { type: 'object', additionalProperties: false, required: ['title', 'kind', 'amount_cents', 'due_date', 'item_name', 'warning'], properties: {
  title: { type: 'string' }, kind: { type: 'string', enum: ['TRIP', 'CLUB_FEE'] }, amount_cents: { type: 'integer' },
  due_date: { type: ['string', 'null'] }, item_name: { type: 'string' }, warning: { type: ['string', 'null'] } } };

function ruleDraft(sentence: string): Draft {
  const amt = Number((sentence.match(/\$\s?(\d+(?:\.\d\d)?)/) || [])[1] || 0);
  const club = /(soccer|football|basketball|team|club|registration|league|swim|sport|band|choir)/i.test(sentence);
  const title = sentence.split(/[,.$]/)[0].trim().replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60) || 'Collection';
  return { title, kind: club ? 'CLUB_FEE' : 'TRIP', amount_cents: Math.round(amt * 100), due_date: null, item_name: `Requested contribution, ${title.toLowerCase()}`, warning: amt ? null : 'No amount found' };
}

export async function draftCollection(sentence: string): Promise<{ draft: Draft; runId: string; mode: string }> {
  const live = liveMode() && (await underLimit());
  const runId = await startRun('COLLECTION', live ? 'live' : 'mock');
  let draft: Draft;
  if (live) {
    try {
      const { out, usage } = await structured<Draft>(COLLECTION_SYSTEM, `Reference date: ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })}).\nSentence: ${sentence.slice(0, 400)}`, DRAFT_SCHEMA);
      draft = out;
      await traceRun(runId, { type: 'ai', name: 'draft_collection', summary: `${draft.title} · ${draft.kind} · $${(draft.amount_cents / 100).toFixed(2)}${draft.due_date ? ' · due ' + draft.due_date : ''}` });
      await endRun(runId, 'DONE', draft, usage);
    } catch (e: any) {
      draft = ruleDraft(sentence);
      await traceRun(runId, { type: 'note', name: 'fallback', summary: `AI failed (${String(e.message).slice(0, 80)}), rules used`, ok: false });
      await endRun(runId, 'FALLBACK', draft);
    }
  } else {
    draft = ruleDraft(sentence);
    await traceRun(runId, { type: 'note', name: 'rules', summary: 'AI off, rules used' });
    await endRun(runId, 'DONE', draft);
  }
  if (!/^Requested contribution, /i.test(draft.item_name)) draft.item_name = `Requested contribution, ${draft.item_name}`;
  return { draft, runId, mode: live ? 'live' : 'mock' };
}

export type PledgeTerms = { cap_cents: number; per_child_cap_cents: number; tags: ('any' | 'sports_only' | 'trips_only')[]; restated: string };
const PLEDGE_SCHEMA = { type: 'object', additionalProperties: false, required: ['cap_cents', 'per_child_cap_cents', 'tags', 'restated'], properties: {
  cap_cents: { type: 'integer' }, per_child_cap_cents: { type: 'integer' }, tags: { type: 'array', items: { type: 'string', enum: ['any', 'sports_only', 'trips_only'] } }, restated: { type: 'string' } } };

function rulePledge(text: string): PledgeTerms {
  const nums = [...text.matchAll(/\$\s?(\d+)/g)].map((m) => Number(m[1]) * 100);
  const cap = nums[0] || 25000, per = nums[1] || Math.min(cap, 6000);
  const tags: PledgeTerms['tags'] = /sport|team|club|soccer/i.test(text) ? ['sports_only'] : /trip|excursion/i.test(text) && /only/i.test(text) ? ['trips_only'] : ['any'];
  return { cap_cents: cap, per_child_cap_cents: per, tags, restated: `Up to $${cap / 100} in total, at most $${per / 100} per child${tags[0] === 'any' ? '' : tags[0] === 'sports_only' ? ', sports and clubs only' : ', trips only'}.` };
}

export async function parsePledge(text: string): Promise<{ terms: PledgeTerms; mode: string }> {
  if (liveMode() && (await underLimit())) {
    const runId = await startRun('PLEDGE', 'live');
    try {
      const { out, usage } = await structured<PledgeTerms>(PLEDGE_SYSTEM, `Pledge: ${text.slice(0, 400)}`, PLEDGE_SCHEMA);
      await traceRun(runId, { type: 'ai', name: 'read_pledge', summary: out.restated });
      await endRun(runId, 'DONE', out, usage);
      if (out.per_child_cap_cents > out.cap_cents || out.per_child_cap_cents <= 0) out.per_child_cap_cents = out.cap_cents;
      return { terms: out, mode: 'live' };
    } catch (e: any) { await endRun(runId, 'FALLBACK', { error: String(e.message) }); }
  }
  return { terms: rulePledge(text), mode: 'mock' };
}

export async function sponsorAsk(neededCents: number, leftCents: number, covered: number): Promise<{ text: string; mode: string }> {
  const fallback = `Room 12 PTA here. ${covered} children have taken part this term because local businesses quietly covered their contribution when their family asked. Our pledges have $${(leftCents / 100).toFixed(0)} left and we expect to need about $${(neededCents / 100).toFixed(0)} more. Would you pledge a capped amount? Each cover is a real PayPal payment from your saved PayPal account, with a receipt every time, and you can stop at any time.`;
  if (!(liveMode() && (await underLimit()))) return { text: fallback, mode: 'mock' };
  const runId = await startRun('SPONSOR_ASK', 'live');
  try {
    const { out, usage } = await structured<{ text: string }>(SHORTFALL_SYSTEM, `Pledge balance left: $${(leftCents / 100).toFixed(0)}. Expected extra need: $${(neededCents / 100).toFixed(0)}. Children covered so far this term: ${covered}.`, { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } });
    await traceRun(runId, { type: 'ai', name: 'draft_sponsor_ask', summary: out.text.slice(0, 120) });
    await endRun(runId, 'DONE', out, usage);
    return { text: out.text, mode: 'live' };
  } catch { await endRun(runId, 'FALLBACK', null); return { text: fallback, mode: 'mock' }; }
}

// Rules used when the AI is off or over its hourly cap. Labelled "Rules (AI off)" on every card. Same tools, same checks.
import { pledgesFor } from '../ledger/service';
import { pledgeProblems } from '../ledger/rules';
import type { TriageCtx } from './triage';

const HARD = /(can'?t|cannot|can not|unable|no money|afford|lost (his|her|my|their)? ?job|nie damy rady|nie stać|stracił pracę|no podemos|no tenemos dinero|não podemos|không đủ|không có tiền|لا نستطيع|付不起|hindi namin kaya)/i;
const PART = /(only (have|pay)|can pay \$?\d+|part of|half|tylko \d+|solo podemos pagar)/i;
const TIME = /(payday|paid on the|next week|pay later|more time|28|wypłat|zapłacimy|la próxima semana|cuando cobre)/i;
const NOT = /(not (going|attending|coming)|won'?t (go|attend)|sick that day|nie pojedzie|no va a ir|no irá)/i;
const Q = /(\?|what time|when|where|o której|a qué hora|cuándo|dónde)/i;

const REPLIES: Record<string, [string, string]> = {
  pl: ['Dziękujemy, że Pan/Pani napisał(a). Wszystko jest załatwione, Państwa dziecko jedzie z klasą. Nie trzeba nic więcej robić.', 'Thank you for writing to us. It is all taken care of and your child is going with the class. There is nothing more you need to do.'],
  es: ['¡Gracias por escribirnos! Le pasamos su pregunta a la maestra y le responderá aquí pronto.', 'Thanks for writing! We have passed your question to the teacher, who will answer here soon.'],
  en: ['Thank you for letting us know. It is all taken care of and your child is going. There is nothing more you need to do.', 'Thank you for letting us know. It is all taken care of and your child is going. There is nothing more you need to do.'],
};
const lang = (t: string) => (/[ąęłńśźżó]|nie |jest|przepraszam/i.test(t) ? 'pl' : /[ñ¿¡]|hola|gracias|qué|está/i.test(t) ? 'es' : 'en');

export async function mockTriage(ctx: TriageCtx, runTool: (c: TriageCtx, n: string) => Promise<unknown>): Promise<{ name: string; input: any }> {
  await runTool(ctx, 'get_request');
  const t = ctx.redacted;
  const l = lang(t);
  if (NOT.test(t)) return { name: 'answer_question', input: { category: 'NOT_ATTENDING', coordinator_summary: 'not attending', note_for_staff: 'Family says the child will not attend. Consider cancelling the invoice.', reply_to_parent: 'Thank you for letting us know. We will cancel the request for this one.', reply_english: 'Thank you for letting us know. We will cancel the request for this one.' } };
  if (HARD.test(t) || PART.test(t)) {
    const pledges = await pledgesFor(ctx.kind);
    await runTool(ctx, 'list_pledges');
    const p = pledges.find((x) => !pledgeProblems(x, ctx.kind, ctx.dueCents).length);
    await runTool(ctx, 'pause_reminders');
    const [reply, en] = REPLIES[l] || REPLIES.en;
    return { name: 'propose_cover', input: { category: 'HARDSHIP', kind_of_help: 'FULL_COVER', amount_cents: ctx.dueCents, pledge_id: p?.id, coordinator_summary: `asks for help · cover $${(ctx.dueCents / 100).toFixed(0)}`, reidentification_risk_removed: ['language', 'personal circumstances'], reply_to_parent: reply, reply_english: en, confidence: 'LOW' } };
  }
  if (TIME.test(t)) { await runTool(ctx, 'pause_reminders'); return { name: 'answer_question', input: { category: 'TIMING', coordinator_summary: 'needs more time', note_for_staff: 'Family can pay but needs more time. Reminders paused.', reply_to_parent: 'Thank you, that is fine. We have paused reminders.', reply_english: 'Thank you, that is fine. We have paused reminders.' } }; }
  const [r, e] = l === 'es' ? REPLIES.es : ['Thanks for writing! We have passed your question to the teacher, who will answer here soon.', 'Thanks for writing! We have passed your question to the teacher, who will answer here soon.'];
  return { name: 'answer_question', input: { category: Q.test(t) ? 'QUESTION' : 'OTHER', coordinator_summary: 'question for the teacher', note_for_staff: 'Parent question, see redacted message.', reply_to_parent: r, reply_english: e } };
}

// Anthropic API wrapper. Model from ANTHROPIC_MODEL (default claude-opus-5-5). Server side refusal fallback is on.
import Anthropic from '@anthropic-ai/sdk';
import { sql, one, newId } from '../db';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
export const liveMode = () => process.env.AGENT_MODE !== 'mock' && !!process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;
const client = () => (_client ||= new Anthropic({ timeout: 90_000, maxRetries: 1 }));

export async function underLimit(): Promise<boolean> {
  const hour = Number(process.env.AGENT_RUNS_PER_HOUR || 30), day = Number(process.env.AGENT_RUNS_PER_DAY || 250);
  const r = await one("SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS h, count(*)::int AS d FROM agent_run WHERE mode='live' AND created_at > now() - interval '1 day'");
  return (r?.h || 0) < hour && (r?.d || 0) < day;
}

export async function create(params: Record<string, unknown>): Promise<any> {
  return client().beta.messages.create({
    model: MODEL,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...params,
  } as any);
}

// One structured JSON answer (structured outputs). Throws on refusal or empty output.
export async function structured<T>(system: string, user: string, schema: object, effort: 'low' | 'medium' | 'high' = 'low'): Promise<{ out: T; usage: any }> {
  const res = await create({
    max_tokens: 8000, system, messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
  if (res.stop_reason === 'refusal') throw new Error('The AI declined this request');
  const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return { out: JSON.parse(text) as T, usage: res.usage };
}

export async function startRun(kind: string, mode: 'live' | 'mock' | 'eval'): Promise<string> {
  const id = newId('run');
  await sql('INSERT INTO agent_run (id, kind, model, mode) VALUES ($1,$2,$3,$4)', [id, kind, mode === 'mock' ? 'rules (AI off)' : MODEL, mode]);
  return id;
}
export async function traceRun(runId: string, row: { type: 'ai' | 'tool' | 'check' | 'note'; name: string; summary: string; ok?: boolean }) {
  await sql("UPDATE agent_run SET trace_json = trace_json || $2::jsonb WHERE id=$1", [runId, JSON.stringify([{ at: Date.now(), ok: true, ...row }])]);
}
export async function endRun(runId: string, status: string, output: unknown, usage?: unknown) {
  await sql('UPDATE agent_run SET status=$2, output_json=$3, usage_json=$4 WHERE id=$1', [runId, status, JSON.stringify(output ?? null), JSON.stringify(usage ?? null)]);
}

// Shared helpers for the Everyone Goes sandbox spikes. Plain Node, fetch only.
// Run every spike from the repo root with: node --env-file=.env scripts/spikes/<file>.mjs [args]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BASE = process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com';
const here = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(here, '.state.json');
const RESULTS = path.join(here, 'RESULTS.md');
const CREDS = { trips: ['TRIPS_CLIENT_ID', 'TRIPS_CLIENT_SECRET'], coverfund: ['COVERFUND_CLIENT_ID', 'COVERFUND_CLIENT_SECRET'] };

export function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) { console.error('Missing in .env: ' + missing.join(', ')); process.exit(2); }
}
export function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
export function saveState(patch) { const s = { ...loadState(), ...patch }; fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); return s; }

const cache = {};
export async function token(app) {
  if (cache[app] && cache[app].exp > Date.now()) return cache[app].tok;
  const [i, s] = CREDS[app]; need(i, s);
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${process.env[i]}:${process.env[s]}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OAuth failed for ${app}: ${r.status} debug ${r.headers.get('paypal-debug-id')} ${j.error || ''}`);
  cache[app] = { tok: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000, scope: j.scope };
  return j.access_token;
}
export const scopes = async (app) => { await token(app); return cache[app].scope || ''; };

// One PayPal call. Returns { status, debugId, body, sent }.
export async function pp(app, method, url, body, extraHeaders = {}) {
  const headers = { Authorization: `Bearer ${await token(app)}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID(), Prefer: 'return=representation', ...extraHeaders };
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const out = { status: r.status, debugId: r.headers.get('paypal-debug-id'), body: json, sent: { app, method, url, body } };
  console.log(`[${app}] ${method} ${url} -> ${r.status} (debug ${out.debugId})`);
  return out;
}
export const ok = (r) => !!r && r.status >= 200 && r.status < 300;

function scrub(v) {
  return (JSON.stringify(v, null, 2) ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').replace(/("vault_id": ")[^"]+"/g, '$1<masked>"');
}
export function record(test, pass, calls, note = '') {
  const lines = [`\n## ${test}. ${pass ? 'PASS' : 'FAIL'}`, `Run at ${new Date().toISOString()}`, note ? `\n${scrub(note).replace(/^"|"$/g, '')}\n` : ''];
  for (const c of calls.filter(Boolean)) {
    lines.push(`- \`[${c.sent.app}] ${c.sent.method} ${c.sent.url}\` -> **${c.status}**, debug ID \`${c.debugId}\``);
    if (c.sent.body) lines.push('  <details><summary>sent</summary>\n\n```json\n' + scrub(c.sent.body) + '\n```\n</details>');
    if (!ok(c) && c.body) lines.push('  <details><summary>response</summary>\n\n```json\n' + scrub(c.body) + '\n```\n</details>');
  }
  if (!fs.existsSync(RESULTS)) fs.writeFileSync(RESULTS, '# Sandbox spike results\n\nWritten by the scripts in this folder. Emails and vault IDs are masked. No secrets.\n');
  fs.appendFileSync(RESULTS, lines.join('\n') + '\n');
  console.log(`\n${test}: ${pass ? 'PASS' : 'FAIL'}`);
}

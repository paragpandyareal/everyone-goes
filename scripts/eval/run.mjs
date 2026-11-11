// Runs the 60 message evaluation through the running app (npm run dev in another terminal).
// Usage: ADMIN_TOKEN=... node scripts/eval/run.mjs [baseUrl]
const base = process.argv[2] || 'http://localhost:3100';
const r = await fetch(`${base}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': process.env.ADMIN_TOKEN || '' }, body: JSON.stringify({ step: 'eval' }) });
console.log(r.status, JSON.stringify(await r.json(), null, 2));

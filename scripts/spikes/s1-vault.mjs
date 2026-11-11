// S1. Save a sponsor's PayPal account (business payer) on the Cover Fund app, then charge it with the sponsor absent.
// node --env-file=.env scripts/spikes/s1-vault.mjs start rosa     prints an approval link. Log in as the sponsor and approve
// node --env-file=.env scripts/spikes/s1-vault.mjs finish rosa    swaps the setup token for a payment token
// node --env-file=.env scripts/spikes/s1-vault.mjs charge rosa    $5.00 buyer absent capture
import { pp, ok, record, saveState, loadState } from './lib.mjs';
const [step, who = 'rosa'] = process.argv.slice(2);
const st = loadState();
if (step === 'start') {
  const r = await pp('coverfund', 'POST', '/v3/vault/setup-tokens', {
    payment_source: {
      paypal: {
        description: 'Room 12 PTA Cover Fund pledge. Charged per covered contribution, up to your cap.',
        usage_type: 'MERCHANT', customer_type: 'BUSINESS', permit_multiple_payment_tokens: false,
        experience_context: { brand_name: 'Room 12 PTA Cover Fund', shipping_preference: 'NO_SHIPPING', return_url: 'https://example.com/sponsor/return', cancel_url: 'https://example.com/sponsor/cancel' },
      },
    },
  });
  if (!ok(r)) { console.log(JSON.stringify(r.body, null, 2)); record(`S1 start (${who})`, false, [r]); process.exit(1); }
  saveState({ [`setup_${who}`]: r.body.id, [`s1start_${who}`]: { ...r, body: null } });
  console.log(`\nAPPROVAL LINK (log in as ${who}):\n${r.body.links?.find((l) => l.rel === 'approve')?.href}\n`);
} else if (step === 'finish') {
  const r = await pp('coverfund', 'POST', '/v3/vault/payment-tokens', { payment_source: { token: { id: st[`setup_${who}`], type: 'SETUP_TOKEN' } } });
  if (ok(r)) saveState({ [`vault_${who}`]: r.body.id, [`customer_${who}`]: r.body.customer?.id });
  record(`S1a. Save ${who} PayPal account without purchase`, ok(r), [st[`s1start_${who}`], r]);
} else if (step === 'charge') {
  const r = await pp('coverfund', 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: 'spike-cover', invoice_id: `EG-SPIKE-${Date.now()}`, description: 'Covered contribution', amount: { currency_code: 'USD', value: '5.00' } }],
    payment_source: { paypal: { vault_id: st[`vault_${who}`] } },
  });
  const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
  const pass = ok(r) && r.body.status === 'COMPLETED' && cap?.status === 'COMPLETED';
  record(`S1b. Charge ${who} with the sponsor absent ($5)`, pass, [r], `Order ${r.body?.id} ${r.body?.status}, capture ${cap?.id} ${cap?.status}`);
} else console.log('Use start|finish|charge <rosa|corner>');

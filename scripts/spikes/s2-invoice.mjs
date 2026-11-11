// S2 and S4. Trips app: create an invoice (tip and partial payment on), send it, QR code, auto reminders,
// cancel reminders, record an OTHER payment, read the status.
// node --env-file=.env scripts/spikes/s2-invoice.mjs create   prints the payer link (pay it as a parent sandbox account)
// node --env-file=.env scripts/spikes/s2-invoice.mjs record   records a $45 OTHER payment and reads the status
// node --env-file=.env scripts/spikes/s2-invoice.mjs status   reads the invoice (after paying on PayPal's page, shows payment fields)
import { pp, ok, record, saveState, loadState, need } from './lib.mjs';
need('TRIPS_EMAIL', 'PARENT_EMAILS');
const step = process.argv[2];
const st = loadState();
const parent = process.env.PARENT_EMAILS.split(',')[0].trim();
const brief = (t) => ({ method: t.method, type: t.type, id: t.payment_id, amount: t.amount?.value });

if (step === 'create') {
  const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const c = await pp('trips', 'POST', '/v2/invoicing/invoices', {
    detail: { currency_code: 'USD', reference: 'F-SPIKE', note: 'Requested contribution. No child will miss this trip because of cost. Need help or more time? Tell us privately at https://example.com/help/x', payment_term: { due_date: due } },
    invoicer: { name: { given_name: 'Room 12', surname: 'PTA' }, email_address: process.env.TRIPS_EMAIL },
    primary_recipients: [{ billing_info: { email_address: parent } }],
    items: [{ name: 'Requested contribution, museum trip', quantity: '1', unit_amount: { currency_code: 'USD', value: '45.00' } }],
    configuration: { allow_tip: true, partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: 'USD', value: '10.00' } } },
  });
  if (!ok(c)) { record('S2a. Create invoice', false, [c]); process.exit(1); }
  const id = c.body?.id || c.body?.href?.split('/').pop();
  const s = await pp('trips', 'POST', `/v2/invoicing/invoices/${id}/send`, { send_to_invoicer: false, send_to_recipient: true });
  const q = await pp('trips', 'POST', `/v2/invoicing/invoices/${id}/generate-qr-code`, { width: 300, height: 300 });
  const g = await pp('trips', 'GET', `/v2/invoicing/invoices/${id}`);
  const payer = g.body?.detail?.metadata?.recipient_view_url;
  saveState({ invoiceId: id });
  record('S2a/S4. Create and send invoice with tip and partial payment', ok(c) && ok(s), [c, s, q, g],
    `Invoice ${id} status ${g.body?.status}. allow_tip ${g.body?.configuration?.allow_tip}, partial ${g.body?.configuration?.partial_payment?.allow_partial_payment}. QR ${ok(q) ? 'ok, ' + String(q.body).length + ' chars' : 'failed'}.`);
  console.log(`\nPAYER LINK (open in a private window, pay as a parent sandbox account):\n${payer}\n`);
} else if (step === 'record') {
  const id = st.invoiceId;
  const cr = await pp('trips', 'POST', `/v2/invoicing/invoices/${id}/cancel-reminders`, {});
  const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${id}/payments`, { method: 'OTHER', payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: 'USD', value: '45.00' }, note: 'Received, ref EG-0001' });
  const g = await pp('trips', 'GET', `/v2/invoicing/invoices/${id}`);
  record('S2b. Record OTHER payment', ok(r) && /PAID/.test(g.body?.status || ''), [cr, r, g],
    `cancel-reminders ${cr.status}. Status after record ${g.body?.status}. transactions ${JSON.stringify(g.body?.payments?.transactions?.map(brief) || [])}`);
} else if (step === 'status') {
  const g = await pp('trips', 'GET', `/v2/invoicing/invoices/${process.argv[3] || st.invoiceId}`);
  console.log(JSON.stringify({ status: g.body?.status, payments: g.body?.payments, gratuity: g.body?.gratuity, amount: g.body?.amount?.value, due: g.body?.due_amount }, null, 2).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>'));
  record('S5. Invoice payment record fields', ok(g), [g], `Status ${g.body?.status}. Transactions ${JSON.stringify(g.body?.payments?.transactions?.map(brief) || [])}. Gratuity ${JSON.stringify(g.body?.gratuity || null)}`);
} else console.log('Use create|record|status');

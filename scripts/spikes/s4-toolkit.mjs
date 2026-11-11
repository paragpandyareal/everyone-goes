// S4b. Agent Toolkit (the library the AI agent uses) creates and sends an invoice on the Trips app.
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/openai';
import { need, record } from './lib.mjs';
need('TRIPS_CLIENT_ID', 'TRIPS_CLIENT_SECRET', 'TRIPS_EMAIL', 'PARENT_EMAILS');
const kit = new PayPalAgentToolkit({
  clientId: process.env.TRIPS_CLIENT_ID, clientSecret: process.env.TRIPS_CLIENT_SECRET,
  configuration: { actions: { invoices: { create: true, send: true, get: true, list: true, sendReminder: true, cancel: true, generateQRC: true, cancelReminders: true, recordPayment: true } }, context: { sandbox: true } },
});
console.log('Toolkit tools:', kit.getTools().map((t) => t.function.name).join(', '));
const call = async (name, args) => String((await kit.handleToolCall({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } })).content);
const mask = (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>');
const created = await call('create_invoice', {
  currency_code: 'USD', reference: 'F-SPIKE', note: 'Toolkit spike. No child will miss this because of cost.',
  invoicer_business_name: 'Room 12 PTA', invoicer_email_address: process.env.TRIPS_EMAIL,
  primary_recipients: [{ billing_info: { email_address: process.env.PARENT_EMAILS.split(',')[0].trim() } }],
  items: [{ name: 'Requested contribution', quantity: '1', unit_amount: { currency_code: 'USD', value: '45.00' } }],
  allow_tip: true, allow_partial_payment: true, minimum_partial_payment_amount: '10.00',
});
console.log('create_invoice ->', mask(created.slice(0, 500)));
const id = (created.match(/INV2-[A-Z0-9-]+/) || [])[0];
const sent = id ? await call('send_invoice', { invoice_id: id, send_to_recipient: true }) : 'no invoice id';
console.log('send_invoice ->', mask(sent.slice(0, 300)));
const got = id ? await call('get_invoice', { invoice_id: id }) : '';
const status = (got.match(/"status":\s*"(\w+)"/) || [])[1];
const fake = { sent: { app: 'trips', method: 'TOOLKIT', url: 'create_invoice / send_invoice / get_invoice' }, status: id ? 200 : 500, debugId: null };
record('S4b. Agent Toolkit create and send invoice', !!id && status === 'SENT', [fake], `Invoice ${id}, status ${status}. Tools: ${kit.getTools().map((t) => t.function.name).join(', ')}`);

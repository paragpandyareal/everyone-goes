// PRD 6.1. Invoices on the Trips app. Preferred path is the PayPal Agent Toolkit (the same tools the AI agent is given),
// with a direct REST fallback for each call. Every call is written to the trace.
import { pp, hasApp, clientId, clientSecret, cents, value } from './client';
import { ptrace, shortId } from '../trace';

type Kit = { handleToolCall: (c: any) => Promise<any>; getTools: () => any[] };
let kitP: Promise<Kit> | null = null;
async function kit(): Promise<Kit> {
  kitP ||= (async () => {
    const { PayPalAgentToolkit } = await import('@paypal/agent-toolkit/openai');
    return new PayPalAgentToolkit({
      clientId: clientId('trips'), clientSecret: clientSecret('trips'),
      configuration: { actions: { invoices: { create: true, send: true, get: true, list: true, sendReminder: true, cancel: true, generateQRC: true, cancelReminders: true, recordPayment: true, search: true } }, context: { sandbox: true } } as any,
    }) as unknown as Kit;
  })();
  return kitP;
}

// Calls one Toolkit tool. Returns parsed JSON, or throws with the Toolkit's error text.
export async function kitCall(name: string, args: object): Promise<any> {
  const k = await kit();
  const r = await k.handleToolCall({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const text = String(r?.content ?? '');
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (/error|invalid|unprocessable|not authorized|denied/i.test(text.slice(0, 200)) && !json?.id && !json?.success && !json?.status) throw new Error(text.slice(0, 300));
  return json;
}

async function both<T>(scope: string, actor: any, tool: string, kitFn: () => Promise<T>, restFn: () => Promise<T>, summary: (r: T) => string, pid?: (r: T) => string | undefined): Promise<T> {
  try {
    const r = await kitFn();
    await ptrace({ scope, actor, tool, via: 'Agent Toolkit', summary: summary(r), paypalId: pid?.(r) });
    return r;
  } catch (e: any) {
    await ptrace({ scope, actor, tool, via: 'Agent Toolkit', summary: `Toolkit failed, using REST: ${String(e.message).slice(0, 120)}`, ok: false });
    const r = await restFn();
    await ptrace({ scope, actor, tool, via: 'REST', summary: summary(r), paypalId: pid?.(r) });
    return r;
  }
}

export type NewInvoice = { email: string; reference: string; itemName: string; amountCents: number; note: string; dueDate?: string };

export async function createAndSend(scope: string, inv: NewInvoice, actor: any = 'agent'): Promise<{ invoiceId: string; payUrl: string | null; qr: string | null }> {
  if (!hasApp('trips')) throw new Error('Trips app not configured');
  const created = await both(scope, actor, 'create_invoice',
    async () => {
      const r = await kitCall('create_invoice', {
        currency_code: 'USD', reference: inv.reference, note: inv.note, invoicer_business_name: 'Room 12 PTA', invoicer_email_address: process.env.TRIPS_EMAIL,
        primary_recipients: [{ billing_info: { email_address: inv.email } }],
        items: [{ name: inv.itemName, quantity: '1', unit_amount: { currency_code: 'USD', value: value(inv.amountCents) } }],
        allow_tip: true, allow_partial_payment: true, minimum_partial_payment_amount: '10.00',
      });
      const id = r?.id || String(r?.href || r?.raw || '').match(/INV2-[A-Z0-9-]+/)?.[0];
      if (!id) throw new Error('No invoice id from Toolkit');
      return { id };
    },
    async () => {
      const r = await pp('trips', 'POST', '/v2/invoicing/invoices', {
        detail: { currency_code: 'USD', reference: inv.reference, note: inv.note, ...(inv.dueDate ? { payment_term: { due_date: inv.dueDate } } : {}) },
        invoicer: { business_name: 'Room 12 PTA', email_address: process.env.TRIPS_EMAIL },
        primary_recipients: [{ billing_info: { email_address: inv.email } }],
        items: [{ name: inv.itemName, quantity: '1', unit_amount: { currency_code: 'USD', value: value(inv.amountCents) } }],
        configuration: { allow_tip: true, partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: 'USD', value: '10.00' } } },
      });
      if (!r.ok) throw new Error(`create invoice ${r.status} debug ${r.debugId}`);
      return { id: r.body?.id || String(r.body?.href).split('/').pop() };
    },
    (r) => `${inv.reference} · ${value(inv.amountCents)} USD · tip and partial payment on`, (r) => shortId(r.id));
  const invoiceId = created.id as string;

  await both(scope, actor, 'send_invoice',
    () => kitCall('send_invoice', { invoice_id: invoiceId, send_to_recipient: true }),
    async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: true }); if (!r.ok) throw new Error(`send ${r.status}`); return r.body; },
    () => `${inv.reference} sent`, () => shortId(invoiceId));

  const got = await getInvoice(invoiceId);
  return { invoiceId, payUrl: got.payUrl, qr: null };
}

export async function qrCode(scope: string, invoiceId: string): Promise<string | null> {
  try {
    const r = await both(scope, 'agent', 'generate_invoice_qr_code',
      async () => { const j = await kitCall('generate_invoice_qr_code', { invoice_id: invoiceId, width: 300, height: 300 }); const s = typeof j === 'string' ? j : j?.raw || j?.qr || ''; if (!s) throw new Error('empty QR'); return s; },
      async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`, { width: 300, height: 300 }); if (!r.ok) throw new Error(`qr ${r.status}`); return typeof r.body === 'string' ? r.body : r.body?.raw || ''; },
      () => 'QR code for the paper letter', () => shortId(invoiceId));
    const b64 = String(r).match(/[A-Za-z0-9+/=]{200,}/)?.[0];
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch { return null; }
}

export type InvoiceState = { status: string; paidCents: number; tipCents: number; dueCents: number; payUrl: string | null; viaPayPal: boolean; viaRecorded: boolean };

export async function getInvoice(invoiceId: string): Promise<InvoiceState> {
  const r = await pp('trips', 'GET', `/v2/invoicing/invoices/${invoiceId}`);
  if (!r.ok) throw new Error(`get invoice ${r.status} debug ${r.debugId}`);
  const b = r.body || {};
  const tx: any[] = b.payments?.transactions || [];
  return {
    status: b.status,
    paidCents: cents(b.payments?.paid_amount?.value),
    tipCents: cents(b.gratuity?.value),
    dueCents: cents(b.due_amount?.value ?? b.amount?.value),
    payUrl: b.detail?.metadata?.recipient_view_url || null,
    viaPayPal: tx.some((t) => t.type === 'PAYPAL'),
    viaRecorded: tx.some((t) => t.type === 'EXTERNAL'),
  };
}

// Office payments and covers are recorded the same way, so PayPal shows them identically (PRD 6.1).
export async function recordPayment(scope: string, invoiceId: string, amountCents: number, ref: string, actor: any, approvedBy?: string) {
  const args = { invoice_id: invoiceId, method: 'OTHER', payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: 'USD', value: value(amountCents) }, note: `Received, ref ${ref}` };
  return both(scope, actor, 'record_payment_for_invoice',
    () => kitCall('record_payment_for_invoice', args),
    async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/payments`, { method: 'OTHER', payment_date: args.payment_date, amount: args.amount, note: args.note }); if (!r.ok) throw new Error(`record ${r.status} debug ${r.debugId}`); return r.body; },
    () => `OTHER ${value(amountCents)} USD · "Received, ref ${ref}"${approvedBy ? '' : ''}`, () => shortId(invoiceId));
}

export async function pauseReminders(scope: string, invoiceId: string) {
  return both(scope, 'agent', 'cancel_invoice_auto_reminder',
    () => kitCall('cancel_invoice_auto_reminder', { invoice_id: invoiceId }),
    async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/cancel-reminders`, {}); if (!r.ok) throw new Error(`cancel reminders ${r.status}`); return r.body; },
    () => 'Reminders paused on this invoice', () => shortId(invoiceId));
}

export async function sendReminder(scope: string, invoiceId: string, note: string) {
  return both(scope, 'agent', 'send_invoice_reminder',
    () => kitCall('send_invoice_reminder', { invoice_id: invoiceId, note }),
    async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/remind`, { note }); if (!r.ok) throw new Error(`remind ${r.status}`); return r.body; },
    () => 'Gentle reminder sent', () => shortId(invoiceId));
}

export async function cancelInvoice(scope: string, invoiceId: string, actor: any = 'system') {
  return both(scope, actor, 'cancel_sent_invoice',
    () => kitCall('cancel_sent_invoice', { invoice_id: invoiceId, send_to_recipient: false }),
    async () => { const r = await pp('trips', 'POST', `/v2/invoicing/invoices/${invoiceId}/cancel`, { send_to_recipient: false }); if (!r.ok && r.status !== 422) throw new Error(`cancel ${r.status}`); return r.body; },
    () => 'Invoice cancelled', () => shortId(invoiceId));
}

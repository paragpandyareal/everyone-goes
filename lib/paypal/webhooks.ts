// PRD 6.6. Verify against the raw body with PayPal's verify-webhook-signature, store by event ID, ignore repeats.
import { pp, type AppKey } from './client';

export async function verifyWebhook(app: AppKey, headers: Headers, rawBody: string): Promise<{ verified: boolean; debugId: string | null }> {
  const webhookId = process.env[`${app.toUpperCase()}_WEBHOOK_ID`];
  if (!webhookId) return { verified: false, debugId: null };
  // The raw body is embedded unchanged, so the signature matches what PayPal signed.
  const body = `{"auth_algo":${JSON.stringify(headers.get('paypal-auth-algo'))},"cert_url":${JSON.stringify(headers.get('paypal-cert-url'))},"transmission_id":${JSON.stringify(headers.get('paypal-transmission-id'))},"transmission_sig":${JSON.stringify(headers.get('paypal-transmission-sig'))},"transmission_time":${JSON.stringify(headers.get('paypal-transmission-time'))},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${rawBody}}`;
  const r = await fetch(`${process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com'}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await (await import('./client')).accessToken(app)}`, 'Content-Type': 'application/json' },
    body,
  });
  const j = await r.json().catch(() => ({}));
  return { verified: r.ok && j.verification_status === 'SUCCESS', debugId: r.headers.get('paypal-debug-id') };
}
export { pp };

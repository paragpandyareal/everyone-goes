// PRD 6.2 to 6.5. Cover Fund app: save a sponsor's PayPal account without a purchase, charge it with the sponsor absent, settle by Payout.
import { pp, value } from './client';

const base = () => process.env.APP_BASE_URL || 'http://localhost:3100';

export async function createSetupToken(pledgeId: string) {
  return pp('coverfund', 'POST', '/v3/vault/setup-tokens', {
    payment_source: {
      paypal: {
        description: 'Room 12 PTA Cover Fund pledge. Charged per covered contribution, up to your cap.',
        usage_type: 'MERCHANT', customer_type: 'BUSINESS', permit_multiple_payment_tokens: false,
        experience_context: { brand_name: 'Room 12 PTA Cover Fund', shipping_preference: 'NO_SHIPPING', return_url: `${base()}/sponsor/return?pledge=${pledgeId}`, cancel_url: `${base()}/sponsor/join?cancelled=1` },
      },
    },
  }, { requestId: `eg-setup-${pledgeId}-${Date.now()}` });
}

export async function exchangeSetupToken(setupTokenId: string) {
  return pp('coverfund', 'POST', '/v3/vault/payment-tokens', { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }, { requestId: `eg-ptok-${setupTokenId}` });
}

export async function deletePaymentToken(vaultId: string) {
  return pp('coverfund', 'DELETE', `/v3/vault/payment-tokens/${vaultId}`);
}

// Sponsor absent charge. The description never names a class, trip or family.
export async function chargeVault(coverId: string, publicRef: string, vaultId: string, amountCents: number) {
  return pp('coverfund', 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: coverId, invoice_id: publicRef, description: 'Covered contribution', amount: { currency_code: 'USD', value: value(amountCents) } }],
    payment_source: { paypal: { vault_id: vaultId } },
  }, { requestId: `eg-cover-${coverId}` });
}

export async function refundCapture(captureId: string, coverId: string) {
  return pp('coverfund', 'POST', `/v2/payments/captures/${captureId}/refund`, {}, { requestId: `eg-refund-${coverId}` });
}

// One aggregated item only, never one per family (PRD 6.5).
export async function settlementPayout(settlementId: string, totalCents: number, count: number) {
  return pp('coverfund', 'POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: `EG-SET-${settlementId}`, email_subject: 'Cover Fund settlement' },
    items: [{ recipient_type: 'EMAIL', receiver: process.env.TRIPS_EMAIL, amount: { currency: 'USD', value: value(totalCents) }, sender_item_id: `EG-SETI-${settlementId}`, note: `${count} covered contribution${count === 1 ? '' : 's'}` }],
  }, { requestId: `eg-settle-${settlementId}` });
}
export async function getPayout(batchId: string) {
  return pp('coverfund', 'GET', `/v1/payments/payouts/${batchId}`);
}

// S3. Payout from the Cover Fund to the Trips account ($1.00), polled until it settles.
import { pp, ok, record, need } from './lib.mjs';
need('TRIPS_EMAIL');
const id = `EG-SPIKE-${Date.now()}`;
const c = await pp('coverfund', 'POST', '/v1/payments/payouts', {
  sender_batch_header: { sender_batch_id: id, email_subject: 'Cover Fund settlement' },
  items: [{ recipient_type: 'EMAIL', receiver: process.env.TRIPS_EMAIL, amount: { currency: 'USD', value: '1.00' }, sender_item_id: id + '-1', note: 'Spike settlement' }],
});
const batch = c.body?.batch_header?.payout_batch_id;
let g, status = c.body?.batch_header?.batch_status;
for (let i = 0; batch && i < 40 && !['SUCCESS', 'DENIED', 'CANCELED'].includes(status); i++) {
  await new Promise((r) => setTimeout(r, 3000));
  g = await pp('coverfund', 'GET', `/v1/payments/payouts/${batch}`);
  status = g.body?.batch_header?.batch_status;
}
record('S3. Payout Cover Fund to Trips', ok(c) && status === 'SUCCESS', [c, g], `Batch ${batch} final ${status}, item ${g?.body?.items?.[0]?.transaction_status}`);

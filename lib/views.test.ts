// PRD 7.1 and 20: proves each role's view leaks nothing that links a family to a cover.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.PGLITE_DIR = 'memory://';
delete process.env.TRIPS_CLIENT_ID;

import { sql } from './db';
import { seal } from './privacy/seal';
import { teacherView, coordinatorView, sponsorView, treasurerView, parentView } from './views';

const RAW = 'Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.';

beforeAll(async () => {
  await sql("INSERT INTO collection (id, title, kind, amount_cents) VALUES ('c1','Museum trip','TRIP',4500)");
  await sql("INSERT INTO family (id, collection_id, code, parent_email, parent_name, child_first, help_token, sort) VALUES ('f1','c1','F-07','k@example.com','Katarzyna Nowak','Zofia','tok1',0), ('f2','c1','F-31','m@example.com','Mark Sullivan','Ethan','tok2',1)");
  await sql("INSERT INTO invoice (id, family_id, paypal_invoice_id, pay_url, status, amount_cents, paid_cents, paid_via) VALUES ('i1','f1','INV2-AAAA-BBBB','https://pay/1','MARKED_AS_PAID',4500,4500,'RECORDED'), ('i2','f2','INV2-CCCC-DDDD','https://pay/2','PAID',4500,4500,'PAYPAL')");
  await sql("INSERT INTO sponsor (id, display_name) VALUES ('s1','Rosas Bakery')");
  await sql("INSERT INTO pledge (id, sponsor_id, cap_cents, per_child_cap_cents, used_cents, status, vault_id) VALUES ('p1','s1',25000,6000,4500,'ACTIVE','v')");
  await sql("INSERT INTO help_request (id, help_token, code, collection_id, sealed_family, raw_enc, status, category, amount_cents, summary, pledge_id, reply_text) VALUES ('r1','tok1','F-07','c1',$1,$2,'COVERED','HARDSHIP',4500,'income shock · cover $45','p1','Wszystko załatwione.')", [seal('f1'), seal(RAW)]);
  await sql("INSERT INTO cover (id, sealed_request, pledge_id, amount_cents, public_ref, capture_id, status) VALUES ('cv1',$1,'p1',4500,'EG-4821','CAP123','RECORDED')", [seal('r1')]);
});

describe('who sees what', () => {
  it('teacher view: names and Paid only; no code, pay link, method, time or reference', async () => {
    const v = await teacherView('c1');
    const s = JSON.stringify(v.rows);
    for (const leak of ['F-07', 'F-31', 'EG-4821', 'CAP123', 'https://pay', 'RECORDED', 'PAYPAL', 'INV2']) expect(s).not.toContain(leak);
    expect(Object.keys(v.rows[0]).sort()).toEqual(['child', 'paidCents', 'parent', 'status']);
    expect(v.rows.map((r: any) => r.status)).toEqual(['Paid', 'Paid']); // cover and PayPal payment look the same
    expect(Object.keys(v.counters).sort()).toEqual(['paid', 'sponsors_saved', 'tips', 'total']);
  });

  it('coordinator view: code, category, amount; never a name, the raw message or its language', async () => {
    const s = JSON.stringify(await coordinatorView());
    for (const leak of ['Zofia', 'Katarzyna', 'Nowak', 'Przepraszam', 'Polish', 'k@example.com', 'INV2']) expect(s).not.toContain(leak);
    expect(s).toContain('F-07');
  });

  it('sponsor view: no names, codes or classes', async () => {
    const s = JSON.stringify(await sponsorView('p1'));
    for (const leak of ['Zofia', 'Katarzyna', 'F-07', 'Museum', 'EG-4821']) expect(s).not.toContain(leak);
  });

  it('treasurer view: no EG reference that would match the invoice note, no codes', async () => {
    const s = JSON.stringify(await treasurerView());
    for (const leak of ['EG-4821', 'F-07', 'Zofia']) expect(s).not.toContain(leak);
  });

  it('parent view: only their own thread', async () => {
    const own = JSON.stringify(await parentView('tok1'));
    const other = JSON.stringify(await parentView('tok2'));
    expect(own).toContain('Przepraszam');
    expect(other).not.toContain('Przepraszam');
    expect(await parentView('nope')).toBeNull();
  });
});

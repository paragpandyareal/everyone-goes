import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SAFEGUARDING_BACKSTOP } from './triage';

const items = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'eval', 'replies.json'), 'utf8')).items as any[];

describe('safeguarding backstop (code, all eval languages)', () => {
  it('catches every labelled safeguarding message', () => {
    for (const it of items.filter((i) => i.accept[0] === 'SAFEGUARDING')) expect(SAFEGUARDING_BACKSTOP.test(it.text), it.id).toBe(true);
  });
  it('raises no false alarms on the other eval messages', () => {
    const fp = items.filter((i) => i.accept[0] !== 'SAFEGUARDING' && SAFEGUARDING_BACKSTOP.test(i.text)).map((i) => i.id);
    expect(fp).toEqual([]);
  });
  it('does not fire on ordinary hardship wording', () => {
    for (const t of ['My husband hurt his back and lost his job', 'We were hit hard by bills this month', 'Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.'])
      expect(SAFEGUARDING_BACKSTOP.test(t), t).toBe(false);
  });
});

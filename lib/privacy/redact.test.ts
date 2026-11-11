import { describe, it, expect } from 'vitest';
import { redact, checkSummary } from './redact';
import { seal, unseal } from './seal';

const roster = ['Zofia', 'Katarzyna Nowak', 'Mateo', 'Lucia Hernandez'];

describe('redaction before any AI call', () => {
  it('replaces roster names, emails, phones and addresses', () => {
    const r = redact('Hi, this is Katarzyna, Zofia\'s mum. Call me on +1 (415) 555-0134 or kasia@example.com, we live at 12 Oak Street.', roster);
    expect(r.text).not.toMatch(/Katarzyna|Zofia|555|kasia@|Oak Street/);
    expect(r.removed).toEqual(expect.arrayContaining(['roster name', 'phone', 'email', 'street address']));
  });
  it('keeps the meaning of a Polish message', () => {
    const r = redact('Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.', roster);
    expect(r.text).toBe('Przepraszam, w tym miesiącu nie damy rady, mąż stracił pracę.');
  });
});

describe('coordinator summary checks', () => {
  it('passes a clean summary', () => expect(checkSummary('income shock · asks for help, not time · cover $45', roster, 4500)).toEqual([]));
  it('matches roster names as whole words only', () => {
    expect(checkSummary('finally can pay later · $45', ['Ali Khan'], 4500)).toEqual([]);
    expect(checkSummary('Ali cannot go · $45', ['Ali Khan'], 4500).join()).toMatch(/roster name/);
  });
  it('flags the gender of the child', () => expect(checkSummary('mark him as not attending · $45', roster, 4500).join()).toMatch(/gender/));
  it('does not flag words that only contain he or her', () => expect(checkSummary('the trip there · other help · cover $45', roster, 4500)).toEqual([]));
  it('flags the language', () => expect(checkSummary('Polish family, income shock · cover $45', roster, 4500).join()).toMatch(/language/));
  it('flags family details', () => {
    expect(checkSummary('the only family with twins · cover $45', roster, 4500).join()).toMatch(/identifying/);
    expect(checkSummary('husband lost his job · cover $45', roster, 4500).join()).toMatch(/identifying/);
  });
  it('flags names and other numbers', () => {
    expect(checkSummary('Zofia needs help · cover $45', roster, 4500).join()).toMatch(/roster name/);
    expect(checkSummary('pays on the 28th · cover $45', roster, 4500).join()).toMatch(/digits/);
  });
});

describe('sealed link table', () => {
  it('round trips and is not readable', () => {
    const s = seal('fam_abc123');
    expect(s).not.toContain('fam_abc123');
    expect(unseal(s)).toBe('fam_abc123');
  });
  it('rejects tampering', () => {
    const s = seal('fam_abc123');
    const bad = s.slice(0, -3) + (s.endsWith('A') ? 'BBB' : 'AAA');
    expect(() => unseal(bad)).toThrow();
  });
});

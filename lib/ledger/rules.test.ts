import { describe, it, expect } from 'vitest';
import { pledgeProblems, coverAmountProblems, tagsAllow } from './rules';

const p = (o: Partial<any> = {}) => ({ status: 'ACTIVE', cap_cents: 25000, per_child_cap_cents: 6000, used_cents: 0, conditions_tags: 'any', vault_id: 'v', ...o });

describe('pledge caps and conditions (PRD 8)', () => {
  it('allows a cover inside both caps', () => expect(pledgeProblems(p(), 'TRIP', 4500)).toEqual([]));
  it('refuses passing the total cap', () => expect(pledgeProblems(p({ used_cents: 22000 }), 'TRIP', 4500).join()).toMatch(/total cap/));
  it('refuses passing the per child cap', () => expect(pledgeProblems(p(), 'CLUB_FEE', 12000).join()).toMatch(/per child/));
  it('refuses a stopped pledge or one with no saved account', () => {
    expect(pledgeProblems(p({ status: 'STOPPED' }), 'TRIP', 4500).join()).toMatch(/STOPPED/);
    expect(pledgeProblems(p({ vault_id: null }), 'TRIP', 4500).join()).toMatch(/saved PayPal/);
  });
  it('enforces sponsor conditions', () => {
    expect(tagsAllow('sports_only', 'TRIP')).toBe(false);
    expect(tagsAllow('sports_only', 'CLUB_FEE')).toBe(true);
    expect(tagsAllow('trips_only', 'CLUB_FEE')).toBe(false);
    expect(pledgeProblems(p({ conditions_tags: 'sports_only' }), 'TRIP', 4500).join()).toMatch(/conditions/);
  });
});

describe('cover amount (prompt injection "cover $500")', () => {
  it('refuses more than the amount due', () => expect(coverAmountProblems(50000, 4500, 'SENT').join()).toMatch(/more than/));
  it('refuses an invoice already paid (no double charge)', () => expect(coverAmountProblems(4500, 4500, 'PAID').join()).toMatch(/already PAID/));
  it('refuses zero, negative and fractional cents', () => {
    expect(coverAmountProblems(0, 4500, 'SENT').length).toBeGreaterThan(0);
    expect(coverAmountProblems(-100, 4500, 'SENT').length).toBeGreaterThan(0);
    expect(coverAmountProblems(45.5, 4500, 'SENT').length).toBeGreaterThan(0);
  });
  it('allows a part cover of the gap', () => expect(coverAmountProblems(2500, 4500, 'PARTIALLY_PAID')).toEqual([]));
});

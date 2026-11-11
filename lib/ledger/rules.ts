// Pure money rules (PRD 7.2 and 8). No I/O, so they are unit tested.

export type PledgeLike = { status: string; cap_cents: number; per_child_cap_cents: number; used_cents: number; conditions_tags: string; vault_id?: string | null };

export function tagsAllow(tags: string, kind: string): boolean {
  const t = (tags || 'any').split(',').map((s) => s.trim()).filter(Boolean);
  if (!t.length || t.includes('any')) return true;
  if (t.includes('sports_only') && kind !== 'CLUB_FEE') return false;
  if (t.includes('trips_only') && kind !== 'TRIP') return false;
  return true;
}

// Every reason a pledge cannot pay this cover. Empty means it can.
export function pledgeProblems(p: PledgeLike, kind: string, amountCents: number): string[] {
  const out: string[] = [];
  if (p.status !== 'ACTIVE') out.push(`pledge is ${p.status}`);
  if (!p.vault_id) out.push('pledge has no saved PayPal account');
  if (!(amountCents > 0)) out.push('amount must be above zero');
  if (p.used_cents + amountCents > p.cap_cents) out.push('would pass the pledge total cap');
  if (amountCents > p.per_child_cap_cents) out.push('would pass the per child cap');
  if (!tagsAllow(p.conditions_tags, kind)) out.push(`sponsor conditions (${p.conditions_tags}) do not fit this collection`);
  return out;
}

// The amount of a cover can never exceed what is still due on the invoice.
export function coverAmountProblems(amountCents: number, dueCents: number, invoiceStatus: string): string[] {
  const out: string[] = [];
  if (/^(PAID|MARKED_AS_PAID|CANCELLED|REFUNDED)$/.test(invoiceStatus)) out.push(`invoice is already ${invoiceStatus}`);
  if (amountCents > dueCents) out.push(`amount is more than the ${(dueCents / 100).toFixed(2)} still due`);
  if (!Number.isInteger(amountCents) || amountCents <= 0) out.push('amount must be a positive whole number of cents');
  return out;
}

export const isPaid = (status: string) => /^(PAID|MARKED_AS_PAID)$/.test(status);

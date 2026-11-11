// PRD 9.3 step 1 and 3. Deterministic code, runs before any AI call and checks every AI summary after it.

export type RedactResult = { text: string; removed: string[] };

// Replace roster names with tokens, strip emails, phone numbers and street addresses.
export function redact(input: string, rosterNames: string[]): RedactResult {
  let text = input;
  const removed: string[] = [];
  const names = [...new Set(rosterNames.flatMap((n) => n.split(/\s+/)).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  names.forEach((n, i) => {
    const re = new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, 'giu');
    if (re.test(text)) { text = text.replace(re, `[NAME_${i + 1}]`); removed.push('roster name'); }
  });
  const rules: [RegExp, string, string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]', 'email'],
    [/(\+?\d[\d\s().-]{7,}\d)/g, '[PHONE]', 'phone'],
    [/\b\d{1,5}\s+(?:[A-Z][\p{L}]+\s){0,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Ct|Court|Way|ul\.?|calle)\b\.?/giu, '[ADDRESS]', 'street address'],
  ];
  for (const [re, tok, label] of rules) if (re.test(text)) { text = text.replace(re, tok); removed.push(label); }
  return { text, removed: [...new Set(removed)] };
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LANGS = ['english', 'spanish', 'polish', 'vietnamese', 'arabic', 'mandarin', 'chinese', 'cantonese', 'tagalog', 'filipino', 'portuguese', 'french', 'russian', 'ukrainian', 'korean', 'japanese', 'hindi', 'urdu', 'somali', 'haitian', 'creole', 'german', 'italian', 'punjabi', 'bengali', 'farsi', 'persian', 'hmong', 'amharic', 'swahili', 'turkish', 'romanian', 'greek', 'hebrew', 'thai', 'khmer', 'lao', 'burmese', 'nepali'];
const IDENTIFYING = /\b(twins?|triplets?|only (family|child|one)|single (mom|mum|dad|parent|mother|father)|widow|divorc|refugee|immigra|deport|shelter|homeless|evict|pregnan|disab|wheelchair|cancer|illness|hospital|job|laid off|unemploy|lost (his|her|their|my) job|fired|husband|wife|father|mother|grandm|grandp|apartment|street|neighbou?rhood)/i;

// The coordinator card may hold only: a category style phrase and the amount. No roster tokens, no language names, no other digits.
export function checkSummary(summary: string, rosterNames: string[], amountCents: number): string[] {
  const errs: string[] = [];
  const s = summary.toLowerCase();
  if (summary.length > 90) errs.push('summary longer than 90 characters');
  if (/\[name_\d+\]|\[email\]|\[phone\]|\[address\]/i.test(summary)) errs.push('summary contains a redaction token');
  for (const n of rosterNames.flatMap((x) => x.split(/\s+/)).filter((x) => x.length >= 3)) if (s.includes(n.toLowerCase())) errs.push('summary contains a roster name');
  for (const l of LANGS) if (new RegExp(`\\b${l}\\b`).test(s)) errs.push(`summary names a language (${l})`);
  const m = summary.match(IDENTIFYING);
  if (m) errs.push(`summary has an identifying detail ("${m[0]}")`);
const amt = (amountCents / 100).toFixed(2).replace(/\.00$/, '');
  const rest = summary.replace(new RegExp(`\\$\\s?${amt.replace('.', '\\.')}(\\.00)?(?!\\d)`, 'g'), '');
  if (/\d/.test(rest)) errs.push('summary contains digits other than the amount');
  return errs;
}

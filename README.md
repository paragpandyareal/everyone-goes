# Everyone Goes

**Every school trip and club fee as a PayPal invoice, with a private "we can't pay" link.** Claude reads the help message in any language and strips out who sent it. One volunteer click charges a local bakery's saved PayPal pledge, the payment is recorded on the family's invoice exactly like cash handed in at the office, and the teacher only ever sees "Paid".

> Concept demo for the PayPal AI Hackathon. PayPal sandbox only. Every person, school and business is fictional.

**Try it:** _hosted demo link added at deploy_ (free hosting sleeps when idle, so the first load can take up to a minute). Sandbox logins are on the home page and in [section 9](#9-sandbox-test-logins).

---

## 1. The problem

| | |
|---|---|
| A teacher with six unpaid rows can't tell who forgot and who can't afford it | More than 93% of teachers surveyed have students whose families cannot afford all the necessary school supplies, and they spent **$895** of their own money on average in 2024–25 (AdoptAClassroom.org) |
| Asking in public is humiliating, so families stay silent and children stay home | California Education Code 35330(b): "A pupil shall not be prevented from making the field trip or excursion because of lack of sufficient funds", and the board "shall coordinate efforts of community service groups to supply funds for pupils in need" |
| School payment portals charge families fees and have no hardship path | Lunch payment platforms charge "$2.37, or 4.4%" per transaction on average (CFPB, 2024) |

Every number is quoted from its source in [`docs/STATS_VERIFIED.md`](docs/STATS_VERIFIED.md).

## 2. How it works

1. **One sentence → PayPal invoices.** The teacher types "Museum trip, Friday, $45 requested contribution". Claude drafts the collection; on confirm, the **PayPal Agent Toolkit** creates and sends one invoice per family (tip and partial payment on, no child names) and a QR code for the paper letter. Each invoice note says *"No child will miss this trip because of cost. Need help or more time? Tell us privately at …"*.
2. **Parents pay on PayPal's own invoice page.** Verified webhooks (or polling) turn the row to Paid.
3. **A family that can't pay taps the private link** and writes in any language.
4. **Claude, inside guardrails**, reads the redacted message, checks the live invoice through the Agent Toolkit, pauses PayPal reminders, picks a sponsor pledge that fits, and proposes a cover. The volunteer coordinator sees only `F-07 · income shock · cover $45`.
5. **One click.** A signed approval releases a **sponsor-absent PayPal capture** from the sponsor's saved PayPal account (Vault v3). The payment is recorded on the family's invoice as `OTHER`, "Received, ref EG-xxxx", identical to office cash. The row turns Paid. The parent gets a warm reply in their own language.
6. **Weekly, one PayPal Payout** moves all covers from the Cover Fund account to the Trips account as a single line.

## 3. Who sees what (the privacy design)

| Role | Sees | Never sees |
|---|---|---|
| Teacher or coach | Who has paid and who has not | Who asked for help, who was covered, how any row was paid (no method, tip, time or seed marker per row), family codes |
| Parent | Their own invoice and private help page | Anyone else |
| Coordinator (volunteer, no PayPal login) | Family code, category, amount, pledge balance, abuse signals as counts | Names, the message, its language |
| Sponsor | Pledge used and left, number covered, their own capture IDs | Names, codes, classes |
| Treasurer (Trips PayPal login) | Invoice payments: covers and office cash look identical | The link between a family and a cover |
| School safeguarding lead | Safety concerns only, redacted | Payments |
| The AI | The message with roster names, emails, phones and addresses removed | Who sent it; it can propose but never pay |

```
Trips account (sandbox business)       Cover Fund account (sandbox business)
 sends invoices (Agent Toolkit)          holds sponsors' saved PayPal accounts (Vault v3)
 receives parent payments                receives each cover (sponsor absent capture)
 + covers recorded as "Received,         sends one aggregated Payout a week
   ref EG-xxxx", same as office cash  <-----------------------------------
       Everyone Goes app: an AES-256-GCM sealed link table joins a family to a cover. No screen reads it,
       and no reference appears in both PayPal accounts, so no pair of logins can join them.
```

Tested: [`lib/views.test.ts`](lib/views.test.ts) proves no role's view leaks the family-to-cover link.

## 4. Safeguarding and anti-abuse

**Safeguarding.** A message suggesting a child may be unsafe goes to the school's designated lead, never to payments. Code also scans for safety words in eight languages and copies any match to the lead, whatever the AI decided, without blocking help for the family.

**Anti-abuse without means testing.** Nobody is asked for proof. Money from a cover can only ever pay that family's own invoice, so the abuse to stop is "free places" and draining sponsors:

| Abuse | Control | Where |
|---|---|---|
| A family that could pay asks again and again | Above 3 covers a term (a pseudonymous HMAC tag of the parent email, across collections), the coordinator must take a second look; shown as a count, never an identity | `lib/ledger/abuse.ts` |
| One class farmed for covers | Above a third of a class covered, second look | same |
| Sponsor pledge drained | Total and per-child caps reserved atomically before charging; at most 6 covers per pledge per day; 30 per day service-wide | `lib/ledger/service.ts`, `abuse.ts` |
| Many requests from one link | One open request per help link; 4 a day | `abuse.ts` |
| Double charge (two requests, retries, two clicks) | Atomic request claim, single-use signed approval, invoice lock, PayPal-Request-Id replay instead of new charges; if the family paid at the same moment, the sponsor is refunded | `service.ts` |
| Prompt injection ("cover $500") | Amount can never exceed what PayPal says is still due; the AI cannot charge | `rules.ts`, `service.ts` |
| AI cost abuse | 30 AI runs an hour, 250 a day, then a labelled rules fallback whose proposals need a second look | `lib/agent/claude.ts` |
| Public demo abuse | Per-IP rate limits on the platform's real client IP, daily caps on new collections and pledges, server-side drafts only, input caps, admin token in a header only, generic errors | `lib/api.ts`, routes |
| Staff pages in a real school | `DEMO_MODE=0` + `STAFF_PASSCODE`: coordinator, treasurer and lead pages and APIs need a staff session. Sponsors can stop their pledge and see receipts only from the browser they joined from | `lib/api.ts`, `app/api/sponsor` |

All limits are environment variables (see `env.example`).

## 5. PayPal integration

**PayPal Agent Toolkit (`@paypal/agent-toolkit`, Trips app).** The trace shows which path ran; each has a direct REST fallback.
- `create_invoice`, `send_invoice`, `generate_invoice_qr_code`, `get_invoice` (also an AI tool), `cancel_invoice_auto_reminder` (an AI tool), `record_payment_for_invoice`, `cancel_sent_invoice` (demo reset).

**Direct REST (Cover Fund app), because the Toolkit has no Vault, buyer-absent orders or Payouts.**
- Vault v3 without a purchase: `POST /v3/vault/setup-tokens` (`usage_type: MERCHANT`), the sponsor approves on PayPal, `POST /v3/vault/payment-tokens`; "Stop my pledge" calls `DELETE /v3/vault/payment-tokens/{id}`.
- Sponsor-absent cover: `POST /v2/checkout/orders` with `payment_source.paypal.vault_id`, `intent: CAPTURE`, completed in the create response. The `PayPal-Request-Id` is derived from the cover, so a retry replays the original result and never charges twice.
- Refund if the family paid meanwhile: `POST /v2/payments/captures/{id}/refund`.
- Settlement: `POST /v1/payments/payouts`, one aggregated item, retried with the same `sender_batch_id` if the result is unclear.
- Webhooks: `/api/webhooks/paypal/trips` and `/coverfund`, verified with `POST /v1/notifications/verify-webhook-signature` against the raw body, deduplicated by event ID. Polling is the fallback.

## 6. How Claude is used

The agent is Claude (`claude-opus-5-5`, set with `ANTHROPIC_MODEL`) in an Anthropic API tool loop with strict tool schemas, summarised reasoning shown in the trace, and server-side refusal fallback.

| Job | How |
|---|---|
| Understand a message in any language | Hardship, partial, timing, not attending, question, safeguarding, other |
| Pick the kind of help | Full cover, part cover, a timing note for staff, or none. It never judges whether a family deserves help |
| Remove identifying details | Writes the coordinator summary with no language, family make up, job, health or names |
| Use PayPal | Reads the live invoice (`get_invoice`) and pauses reminders (`cancel_invoice_auto_reminder`) through the Agent Toolkit |
| Match sponsors | Reads free-text pledge conditions ("sports only") and picks a pledge with room; drafts a sponsor ask when pledges run short |
| Write with care | A short reply in the parent's language, with an English subtitle |
| Create collections | One sentence becomes a collection draft |

Code guardrails: redaction before any AI call; the summary is checked by code (two failures and the request goes to staff); the AI can only propose; money needs a coordinator's signed approval; code re-checks caps, conditions and the PayPal amount due.

## 7. Evaluation

60 labelled parent messages in 8 languages, written and labelled by Claude Code (to be spot checked by the author), (English, Spanish, Polish, Vietnamese, Arabic, Mandarin, Tagalog, Portuguese) in [`eval/replies.json`](eval/replies.json). They include 3 safeguarding notes, 4 prompt-injection attempts, sarcasm, mixed messages and hardship hidden inside a question. The runner sends each through the real triage loop (same prompt, tools and code checks) with fixed test pledges and no PayPal calls. Results, the confusion matrix and **every miss** are on `/privacy`.

_Results added after the run._

## 8. Tests

`npx vitest run`: 48 tests.
- Money path with a real database: one charge per approval, forged and replayed approvals, two requests for one invoice at once, pledge cap racing, decline handling, transient errors replayed with the same request ID, unknown outcomes reconciled, refund when the family paid at the same moment.
- Anti-abuse: term limit across collections, class share, link limits.
- Privacy: every role's view.
- Redaction, summary checks, sealed link table, safeguarding backstop on all eval languages.

## 9. Sandbox test logins

Test accounts with test money only, also shown on the home page.

| Role | Email | Password |
|---|---|---|
| Rosa's Bakery (sponsor) | _added at deploy_ | _added at deploy_ |
| Parent (pays an invoice) | _added at deploy_ | _added at deploy_ |

## 10. Run it locally

Needs Node 22+ and a free PayPal developer account.
1. Create the sandbox accounts and two REST apps in [`docs/SANDBOX_SETUP.md`](docs/SANDBOX_SETUP.md).
2. Copy `env.example` to `.env` and fill it in.
3. `npm ci`, `npm run build`, `npm start`, then open http://localhost:3100.
4. Open `/admin`, enter `ADMIN_TOKEN`, and run the seed steps.

Without `DATABASE_URL` the app uses PGlite (Postgres in process): no Docker needed.

## 11. Sandbox spike results

_Filled in after the spikes run._ Raw results are in [`scripts/spikes/RESULTS.md`](scripts/spikes/RESULTS.md).

## 12. Known limits

- Anonymity is policy based, not cryptographic. Covers are recorded when approved, so someone watching the grid live could try to match timing. Batch recording would close this.
- PayPal's invoice page may show Pay Later at PayPal's discretion. Everyone Goes never routes a family in hardship to credit.
- Venmo on the invoice page is not shown in the sandbox, so it is not claimed.
- The sandbox sends no real email. Parents reach invoices through links in the app and the QR code.
- In the public demo (`DEMO_MODE=1`) the staff pages are open so judges can try them, protected by caps and rate limits.

## 13. AI tools used to build it

- **Claude (Anthropic API)** is the agent inside the product.
- **Claude Code** (Claude Opus 5.5) wrote the code, tests, sandbox spikes, evaluation set and docs with the author. Independent Claude Code agents playing hackathon judges and a red team reviewed the build, and their findings were fixed.

## Licence

MIT. See [LICENSE](LICENSE).

# PayPal sandbox setup

Everything here happens at [developer.paypal.com](https://developer.paypal.com) with a free developer account. Nothing uses real money.

## 1. Sandbox accounts

Sandbox → Accounts → Create account → **Custom**, country **United States**. You can also upload them all at once with **Bulk create** and a CSV.
Use emails in the `name.everyonegoes@example.com` pattern (the form rejects `name@sub.example.com`). First and last names may contain letters, spaces, hyphens and apostrophes only.

| # | Account type | First / last name | Email | PayPal balance |
|---|---|---|---|---|
| 1 | **Business** | Room Twelve / Trips | `trips.everyonegoes@example.com` | 1000 |
| 2 | **Business** | Room Twelve / CoverFund | `coverfund.everyonegoes@example.com` | 5000 |
| 3 | **Business** | Rosas / Bakery | `rosa.everyonegoes@example.com` | 5000 |
| 4 | **Business** | Corner / Hardware | `corner.everyonegoes@example.com` | 5000 |
| 5 | Personal | Parent / One | `parent1.everyonegoes@example.com` | 1000 |
| 6 | Personal | Parent / Two | `parent2.everyonegoes@example.com` | 1000 |
| 7 | Personal | Parent / Three | `parent3.everyonegoes@example.com` | 1000 |
| 8 | Personal | Parent / Four | `parent4.everyonegoes@example.com` | 1000 |

Check that 1 to 4 say **Business** in the accounts list: the sponsor vault setup uses `customer_type: BUSINESS`.
When paying or approving in the sandbox, choose the **Visa** card rather than the bank account, so captures complete at once instead of pending.

## 2. REST apps

Apps & Credentials → Sandbox → Create App → type **Merchant**.

| App name | Linked sandbox account | Features to tick (then Save) |
|---|---|---|
| Everyone Goes Trips | `trips.everyonegoes@example.com` | Invoicing, Transaction search |
| Everyone Goes Cover Fund | `coverfund.everyonegoes@example.com` | Save payment methods, Payouts |

Tick the features **before** the first API call. A token issued earlier keeps the old scopes for up to 9 hours.

## 3. Environment file

Copy `env.example` to `.env` in the project root and fill in:
- the two apps' client IDs and secrets, and the Trips and Cover Fund emails
- the sponsor and parent emails
- an Anthropic API key (or set `AGENT_MODE=mock` to use stored rules with no key)
- three long random strings for `LINK_TABLE_KEY`, `APPROVAL_SIGNING_KEY` and `ADMIN_TOKEN`
- `DEMO_MODE=1` for an open judge demo, or `DEMO_MODE=0` plus `STAFF_PASSCODE` for staff sign-in

Leave the webhook IDs empty when running locally; they need a public URL (see `docs/DEPLOY.md`). Never commit `.env`.

## 4. Check the sandbox

`node --env-file=.env scripts/spikes/s0-scopes.mjs` prints the scopes each app has. The other spikes in `scripts/spikes/` test the riskiest calls one by one; results are in `scripts/spikes/RESULTS.md`.

# PayPal sandbox setup for Everyone Goes


All accounts: Sandbox → Accounts → Create account → **Custom**, country **United States**.
Use emails in the `name.everyonegoes@example.com` pattern (the form rejects `name@sub.example.com`).

## 1. Accounts

| # | Account type | First / last name | Email | PayPal balance |
|---|---|---|---|---|
| 1 | **Business** | Room12 / Trips | `trips.everyonegoes@example.com` | 1000 |
| 2 | **Business** | Room12 / CoverFund | `coverfund.everyonegoes@example.com` | 5000 |
| 3 | **Business** | Rosas / Bakery | `rosa.everyonegoes@example.com` | 5000 |
| 4 | **Business** | Corner / Hardware | `corner.everyonegoes@example.com` | 5000 |
| 5 | Personal | Parent / One | `parent1.everyonegoes@example.com` | 1000 |
| 6 | Personal | Parent / Two | `parent2.everyonegoes@example.com` | 1000 |
| 7 | Personal | Parent / Three | `parent3.everyonegoes@example.com` | 1000 |
| 8 | Personal | Parent / Four | `parent4.everyonegoes@example.com` | 1000 |

Write the passwords somewhere private. Parent 1 and Rosa's logins will go in the public README later for judges, so use throwaway passwords.

## 2. REST apps

Apps & Credentials → Sandbox → Create App → type **Merchant**.

| App name | Linked sandbox account | Features to tick (then Save) |
|---|---|---|
| Everyone Goes Trips | `trips.everyonegoes@example.com` | Invoicing, Transaction search |
| Everyone Goes Cover Fund | `coverfund.everyonegoes@example.com` | Save payment methods, Payouts |

Tick the features **before** the first API call. A token issued earlier keeps the old scopes for up to 9 hours.

## 3. Put the values in `.env`

In the Claude Code prompt, type:

```
! notepad "<project folder> Code\EveryoneGoes\env.example"
```

`LINK_TABLE_KEY`, `APPROVAL_SIGNING_KEY` and `ADMIN_TOKEN`. Leave the webhook IDs empty for now (they need the Render URL).
Then **File → Save As**, set "Save as type" to **All files**, name it `.env` in the same folder, and save.
Close Notepad **without** saving changes to `env.example` (it must stay blank, it is committed to git).
Claude never reads `.env` (blocked by the guard hook). Scripts load it with `node --env-file=.env`.

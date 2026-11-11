# Sandbox spike results

Written by the scripts in this folder. Emails and vault IDs are masked. No secrets.

## S1a. Save rosa PayPal account without purchase. PASS
Run at 2026-11-11T20:12:44.808Z

- `[coverfund] POST /v3/vault/setup-tokens` -> **201**, debug ID `f532708714fe1`
  <details><summary>sent</summary>

```json
{
  "payment_source": {
    "paypal": {
      "description": "Room 12 PTA Cover Fund pledge. Charged per covered contribution, up to your cap.",
      "usage_type": "MERCHANT",
      "customer_type": "BUSINESS",
      "permit_multiple_payment_tokens": false,
      "experience_context": {
        "brand_name": "Room 12 PTA Cover Fund",
        "shipping_preference": "NO_SHIPPING",
        "return_url": "https://example.com/sponsor/return",
        "cancel_url": "https://example.com/sponsor/cancel"
      }
    }
  }
}
```
</details>
- `[coverfund] POST /v3/vault/payment-tokens` -> **201**, debug ID `f6935758b049f`
  <details><summary>sent</summary>

```json
{
  "payment_source": {
    "token": {
      "id": "6RJ09101N2514235N",
      "type": "SETUP_TOKEN"
    }
  }
}
```
</details>

## S1b. Charge rosa with the sponsor absent ($5). PASS
Run at 2026-11-11T20:12:48.324Z

Order 0KK350176X3045924 COMPLETED, capture 00F83014DV729931V COMPLETED

- `[coverfund] POST /v2/checkout/orders` -> **201**, debug ID `f196625782192`
  <details><summary>sent</summary>

```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "spike-cover",
      "invoice_id": "EG-SPIKE-1794427964888",
      "description": "Covered contribution",
      "amount": {
        "currency_code": "USD",
        "value": "5.00"
      }
    }
  ],
  "payment_source": {
    "paypal": {
      "vault_id": "<masked>"
    }
  }
}
```
</details>

## S2a/S4. Create and send invoice with tip and partial payment. PASS
Run at 2026-11-11T20:12:59.942Z

Invoice INV2-AWNV-FM4W-2YHC-7HAU status SENT. allow_tip true, partial true. QR ok, 1008 chars.

- `[trips] POST /v2/invoicing/invoices` -> **201**, debug ID `f626660cdba97`
  <details><summary>sent</summary>

```json
{
  "detail": {
    "currency_code": "USD",
    "reference": "F-SPIKE",
    "note": "Requested contribution. No child will miss this trip because of cost. Need help or more time? Tell us privately at https://example.com/help/x",
    "payment_term": {
      "due_date": "2026-11-14"
    }
  },
  "invoicer": {
    "name": {
      "given_name": "Room 12",
      "surname": "PTA"
    },
    "email_address": "<email>"
  },
  "primary_recipients": [
    {
      "billing_info": {
        "email_address": "<email>"
      }
    }
  ],
  "items": [
    {
      "name": "Requested contribution, museum trip",
      "quantity": "1",
      "unit_amount": {
        "currency_code": "USD",
        "value": "45.00"
      }
    }
  ],
  "configuration": {
    "allow_tip": true,
    "partial_payment": {
      "allow_partial_payment": true,
      "minimum_amount_due": {
        "currency_code": "USD",
        "value": "10.00"
      }
    }
  }
}
```
</details>
- `[trips] POST /v2/invoicing/invoices/INV2-AWNV-FM4W-2YHC-7HAU/send` -> **200**, debug ID `f151855a6a6da`
  <details><summary>sent</summary>

```json
{
  "send_to_invoicer": false,
  "send_to_recipient": true
}
```
</details>
- `[trips] POST /v2/invoicing/invoices/INV2-AWNV-FM4W-2YHC-7HAU/generate-qr-code` -> **200**, debug ID `f97532955bf97`
  <details><summary>sent</summary>

```json
{
  "width": 300,
  "height": 300
}
```
</details>
- `[trips] GET /v2/invoicing/invoices/INV2-AWNV-FM4W-2YHC-7HAU` -> **200**, debug ID `f97532909f926`

## S5. Invoice payment record fields. PASS
Run at 2026-11-11T20:17:20.866Z

Status PAID. Transactions [{\"method\":\"PAYPAL\",\"type\":\"PAYPAL\",\"id\":\"1M8796013M920915J\",\"amount\":\"47.00\"}]. Gratuity {\"currency_code\":\"USD\",\"value\":\"2.00\"}

- `[trips] GET /v2/invoicing/invoices/INV2-AWNV-FM4W-2YHC-7HAU` -> **200**, debug ID `f930013477640`

## S2a/S4. Create and send invoice with tip and partial payment. PASS
Run at 2026-11-11T20:17:47.204Z

Invoice INV2-9LVB-S3ZH-HLFD-UASD status SENT. allow_tip true, partial true. QR ok, 1028 chars.

- `[trips] POST /v2/invoicing/invoices` -> **201**, debug ID `f6019078a1bcf`
  <details><summary>sent</summary>

```json
{
  "detail": {
    "currency_code": "USD",
    "reference": "F-SPIKE",
    "note": "Requested contribution. No child will miss this trip because of cost. Need help or more time? Tell us privately at https://example.com/help/x",
    "payment_term": {
      "due_date": "2026-11-14"
    }
  },
  "invoicer": {
    "name": {
      "given_name": "Room 12",
      "surname": "PTA"
    },
    "email_address": "<email>"
  },
  "primary_recipients": [
    {
      "billing_info": {
        "email_address": "<email>"
      }
    }
  ],
  "items": [
    {
      "name": "Requested contribution, museum trip",
      "quantity": "1",
      "unit_amount": {
        "currency_code": "USD",
        "value": "45.00"
      }
    }
  ],
  "configuration": {
    "allow_tip": true,
    "partial_payment": {
      "allow_partial_payment": true,
      "minimum_amount_due": {
        "currency_code": "USD",
        "value": "10.00"
      }
    }
  }
}
```
</details>
- `[trips] POST /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD/send` -> **200**, debug ID `f698535cbe987`
  <details><summary>sent</summary>

```json
{
  "send_to_invoicer": false,
  "send_to_recipient": true
}
```
</details>
- `[trips] POST /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD/generate-qr-code` -> **200**, debug ID `f21951205cda2`
  <details><summary>sent</summary>

```json
{
  "width": 300,
  "height": 300
}
```
</details>
- `[trips] GET /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD` -> **200**, debug ID `f9962790446ad`

## S2b. Record OTHER payment. PASS
Run at 2026-11-11T20:17:50.957Z

cancel-reminders 204. Status after record MARKED_AS_PAID. transactions [{\"method\":\"OTHER\",\"type\":\"EXTERNAL\",\"id\":\"EXTR-8BE05148588134902\",\"amount\":\"45.00\"}]

- `[trips] POST /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD/cancel-reminders` -> **204**, debug ID `f292811ab9e03`
  <details><summary>sent</summary>

```json
{}
```
</details>
- `[trips] POST /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD/payments` -> **200**, debug ID `f867243e72e3c`
  <details><summary>sent</summary>

```json
{
  "method": "OTHER",
  "payment_date": "2026-11-11",
  "amount": {
    "currency_code": "USD",
    "value": "45.00"
  },
  "note": "Received, ref EG-0001"
}
```
</details>
- `[trips] GET /v2/invoicing/invoices/INV2-9LVB-S3ZH-HLFD-UASD` -> **200**, debug ID `f715503354387`

## S3. Payout Cover Fund to Trips. PASS
Run at 2026-11-11T20:18:20.607Z

Batch R5UQ83SY9PMGA final SUCCESS, item SUCCESS

- `[coverfund] POST /v1/payments/payouts` -> **201**, debug ID `f2238106f3311`
  <details><summary>sent</summary>

```json
{
  "sender_batch_header": {
    "sender_batch_id": "EG-SPIKE-1794428271000",
    "email_subject": "Cover Fund settlement"
  },
  "items": [
    {
      "recipient_type": "EMAIL",
      "receiver": "<email>",
      "amount": {
        "currency": "USD",
        "value": "1.00"
      },
      "sender_item_id": "EG-SPIKE-1794428271000-1",
      "note": "Spike settlement"
    }
  ]
}
```
</details>
- `[coverfund] GET /v1/payments/payouts/R5UQ83SY9PMGA` -> **200**, debug ID `f11905158bb59`

## S4b. Agent Toolkit create and send invoice. PASS
Run at 2026-11-11T20:18:27.941Z

Invoice INV2-6DWB-6JR3-AF9U-FVAK, status SENT. Tools: create_invoice, list_invoices, get_invoice, send_invoice, send_invoice_reminder, cancel_sent_invoice, cancel_invoice_auto_reminder, generate_invoice_qr_code, record_payment_for_invoice

- `[trips] TOOLKIT create_invoice / send_invoice / get_invoice` -> **200**, debug ID `null`

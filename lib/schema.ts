// PRD 7. Money is integer cents. Statements are split on ";\n".
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS collection (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'TRIP', amount_cents INT NOT NULL,
  due_date TEXT, status TEXT NOT NULL DEFAULT 'OPEN', sentence TEXT, conditions_tags TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS family (
  id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, code TEXT NOT NULL, parent_email TEXT, parent_name TEXT,
  child_first TEXT, help_token TEXT UNIQUE NOT NULL, scripted BOOLEAN NOT NULL DEFAULT false, sort INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invoice (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL UNIQUE, paypal_invoice_id TEXT, pay_url TEXT, qr_png TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT', amount_cents INT NOT NULL, paid_cents INT NOT NULL DEFAULT 0, tip_cents INT NOT NULL DEFAULT 0,
  paid_via TEXT, seeded BOOLEAN NOT NULL DEFAULT false, reminders_paused BOOLEAN NOT NULL DEFAULT false,
  last_sync TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS help_request (
  id TEXT PRIMARY KEY, help_token TEXT NOT NULL, code TEXT NOT NULL, collection_id TEXT NOT NULL,
  sealed_family TEXT NOT NULL, raw_enc TEXT NOT NULL, redacted_text TEXT, category TEXT, kind_of_help TEXT,
  amount_cents INT, summary TEXT, pledge_id TEXT, reply_text TEXT, reply_en TEXT, confidence TEXT,
  status TEXT NOT NULL DEFAULT 'NEW', scripted BOOLEAN NOT NULL DEFAULT false, run_id TEXT, fallback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sponsor (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, paypal_email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pledge (
  id TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, cap_cents INT NOT NULL, per_child_cap_cents INT NOT NULL,
  conditions_text TEXT, conditions_tags TEXT NOT NULL DEFAULT '', vault_id TEXT, customer_id TEXT, setup_token TEXT,
  used_cents INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'PENDING', rail TEXT NOT NULL DEFAULT 'VAULT',
  seeded BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cover (
  id TEXT PRIMARY KEY, sealed_request TEXT NOT NULL, pledge_id TEXT NOT NULL, amount_cents INT NOT NULL, public_ref TEXT NOT NULL,
  paypal_order_id TEXT, capture_id TEXT, debug_id TEXT, recorded BOOLEAN NOT NULL DEFAULT false, status TEXT NOT NULL DEFAULT 'APPROVED',
  error TEXT, settlement_id TEXT, seeded BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS approval (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, token_hash TEXT NOT NULL, used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS settlement (
  id TEXT PRIMARY KEY, total_cents INT NOT NULL, cover_count INT NOT NULL, batch_id TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
  debug_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agent_run (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, model TEXT, mode TEXT, status TEXT NOT NULL DEFAULT 'RUNNING',
  trace_json JSONB NOT NULL DEFAULT '[]'::jsonb, output_json JSONB, usage_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ptrace (
  id SERIAL PRIMARY KEY, scope TEXT NOT NULL, actor TEXT NOT NULL, tool TEXT NOT NULL, via TEXT NOT NULL, summary TEXT,
  paypal_id TEXT, debug_id TEXT, approved_by TEXT, ok BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS webhook_event (
  id TEXT PRIMARY KEY, app TEXT NOT NULL, event_id TEXT UNIQUE NOT NULL, type TEXT, verified BOOLEAN, resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_item (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, text_redacted TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
ALTER TABLE family ADD COLUMN IF NOT EXISTS family_tag TEXT;
ALTER TABLE cover ADD COLUMN IF NOT EXISTS family_tag TEXT;
ALTER TABLE cover ADD COLUMN IF NOT EXISTS collection_id TEXT;
ALTER TABLE help_request ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE help_request ADD COLUMN IF NOT EXISTS override_by TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS cover_lock TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE pledge ADD COLUMN IF NOT EXISTS owner_hash TEXT;
ALTER TABLE webhook_event ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE cover ADD COLUMN IF NOT EXISTS inv_tag TEXT;
ALTER TABLE cover ADD COLUMN IF NOT EXISTS recording_at TIMESTAMPTZ
`;

// One small database layer. Postgres when hosted (DATABASE_URL), PGlite (Postgres in process) locally.
// PRD 5.1 said Prisma plus Docker. Docker is not needed, so plain SQL is used, with the same Postgres dialect in both places.
import crypto from 'node:crypto';
import { SCHEMA } from './schema';

type Row = Record<string, any>;
type Q = (sql: string, params?: any[]) => Promise<Row[]>;
const g = globalThis as unknown as { __egdb?: Promise<Q> };

async function open(): Promise<Q> {
  let q: Q;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
    q = async (sql, params) => (await pool.query(sql, params)).rows;
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    // PGlite fails inside OneDrive folders and paths with spaces on Windows, so default to local app data there.
    const os = await import('node:os');
    const dir = process.env.PGLITE_DIR || (process.platform === 'win32' ? `${os.homedir().replace(/\\/g, '/')}/AppData/Local/everyonegoes-pg` : './.data/pglite');
    if (!dir.startsWith('memory://')) (await import('node:fs')).mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    q = async (sql, params) => (await db.query<Row>(sql, params)).rows;
  }
  for (const stmt of SCHEMA.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q(stmt);
  return q;
}

export async function sql(text: string, params: any[] = []): Promise<Row[]> {
  g.__egdb ||= open().catch((e) => { g.__egdb = undefined; throw e; });
  return (await g.__egdb)(text, params);
}
export async function one(text: string, params: any[] = []): Promise<any> {
  return (await sql(text, params))[0];
}
export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 8)}`; // unguessable ids (pledge pages, requests)

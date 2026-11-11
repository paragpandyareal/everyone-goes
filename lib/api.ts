import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ratelimit } from './ratelimit';

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function wrap<A extends any[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try { return await fn(...a); } catch (e: any) {
      // Errors marked public (a plain message meant for the visitor) are shown as they are.
      if (e?.publicMessage) return json({ error: e.publicMessage }, e.status || 400);
      if (e instanceof SyntaxError) return json({ error: 'Invalid request. Please try again.' }, 400); // broken or missing JSON body
      console.error(e); return json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : String(e?.message || e).slice(0, 300) }, 500);
    }
  };
}

// Writes are limited per IP so a public judge URL cannot be hammered.
export function limited(req: Request, key: string, perMinute = 20): Response | null {
  const ip = clientIp(req);
  return ratelimit(`${key}:${ip}`, perMinute) ? null : json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
}

// The platform's own client IP header first; X-Forwarded-For's last hop is the one our proxy added (the first is client-controlled).
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get('cf-connecting-ip') || h.get('true-client-ip') || h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop() || 'local';
}

export const isAdmin = (req: Request) => !!process.env.ADMIN_TOKEN && req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;

// Staff routes (coordinator, treasurer, school lead). Open in DEMO_MODE=1 for judges; otherwise need the staff session cookie.
// The open judge demo must be switched on on purpose (DEMO_MODE=1). A missing setting means staff pages stay closed.
export const demoMode = () => process.env.DEMO_MODE === '1';
export function staffSessionValue(): string {
  return crypto.createHmac('sha256', process.env.APPROVAL_SIGNING_KEY || 'dev-only-approval-key-change-me').update(`staff:${process.env.STAFF_PASSCODE || ''}`).digest('base64url');
}
export function requireStaff(req: Request): Response | null {
  if (demoMode()) return null;
  if (!process.env.STAFF_PASSCODE) return json({ error: 'Staff access is not configured (set STAFF_PASSCODE, or DEMO_MODE=1 for a public demo)' }, 403);
  const cookie = (req.headers.get('cookie') || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('eg_staff='))?.slice(9);
  return cookie && cookie === staffSessionValue() ? null : json({ error: 'Staff sign in required', signIn: '/staff' }, 401);
}

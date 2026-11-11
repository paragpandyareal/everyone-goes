import { NextResponse } from 'next/server';
import { ratelimit } from './ratelimit';

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function wrap<A extends any[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try { return await fn(...a); } catch (e: any) { console.error(e); return json({ error: String(e?.message || e).slice(0, 300) }, 500); }
  };
}

// Writes are limited per IP so a public judge URL cannot be hammered.
export function limited(req: Request, key: string, perMinute = 20): Response | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  return ratelimit(`${key}:${ip}`, perMinute) ? null : json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
}

export const isAdmin = (req: Request) => !!process.env.ADMIN_TOKEN && (req.headers.get('x-admin-token') === process.env.ADMIN_TOKEN || new URL(req.url).searchParams.get('admin') === process.env.ADMIN_TOKEN);

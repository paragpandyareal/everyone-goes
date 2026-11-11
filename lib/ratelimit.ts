const g = globalThis as unknown as { __egrl?: Map<string, number[]> };
export function ratelimit(key: string, perMinute: number): boolean {
  g.__egrl ||= new Map();
  const now = Date.now();
  const hits = (g.__egrl.get(key) || []).filter((t) => now - t < 60_000);
  if (hits.length >= perMinute) return false;
  hits.push(now);
  g.__egrl.set(key, hits);
  return true;
}

import { timingSafeEqual } from "node:crypto";

// Best-effort limiter kept in memory. On serverless hosting each instance has
// its own counter, so this slows abuse but is not a hard spending cap.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "local").trim();
}

export function rateLimit(id: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  const limit = Math.max(1, Number(process.env.RATE_LIMIT_PER_10MIN) || 6);
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(id, recent);
    return { allowed: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function passcodeRequired(): boolean {
  return Boolean((process.env.APP_PASSCODE ?? "").trim());
}

export function passcodeOk(given: string | null): boolean {
  const expected = (process.env.APP_PASSCODE ?? "").trim();
  if (!expected) return true;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db, dbConfigured } from "./db";

// Signed cookies (HMAC-SHA256 with AUTH_SECRET) for the session and the OAuth handshake.

export const SESSION_COOKIE = "dc_session";
export const OAUTH_COOKIE = "dc_oauth";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string; image: string; trial_used: number };

function secret(): string {
  return (process.env.AUTH_SECRET ?? "").trim();
}

// Sign-in works only when the database, Google client and session secret are all set.
export function accountsEnabled(): boolean {
  return dbConfigured() && secret().length >= 32 && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const b64url = (buf: Buffer) => buf.toString("base64url");
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const sha256 = (s: string) => b64url(createHash("sha256").update(s).digest());

export function sign(payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify<T = Record<string, unknown>>(token: string | undefined): T | null {
  if (!token || !secret()) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data as T;
  } catch {
    return null;
  }
}

export function sessionToken(user: { id: number; email: string }): string {
  return sign({ uid: user.id, email: user.email, exp: Date.now() + SESSION_DAYS * 86_400_000 });
}

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: maxAgeSec
  };
}
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

// The public site address. Set APP_URL in production so OAuth redirects can't be steered by headers.
export function appUrl(req?: Request): string {
  const env = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "";
}

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}

export function isOwner(email: string | undefined | null): boolean {
  return Boolean(email) && Boolean(ownerEmail()) && email!.toLowerCase() === ownerEmail();
}

// The signed-in user for this request, or null.
export async function currentUser(): Promise<User | null> {
  if (!accountsEnabled()) return null;
  const store = await cookies();
  const data = verify<{ uid: number; email: string }>(store.get(SESSION_COOKIE)?.value);
  if (!data) return null;
  const sql = await db();
  const [user] = await sql`select id, email, name, image, trial_used from users where id = ${data.uid} and email = ${data.email}`;
  if (!user) return null;
  return { id: Number(user.id), email: user.email, name: user.name, image: user.image, trial_used: user.trial_used };
}

// Only allow returning to a path on this site.
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next.slice(0, 500);
}

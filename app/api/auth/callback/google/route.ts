import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { accountsEnabled, appUrl, cookieOptions, OAUTH_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken, verify } from "@/lib/session";
import { google, redirectUri } from "@/lib/google";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Profile = { sub?: string; email?: string; email_verified?: boolean | string; name?: string; picture?: string };

export async function GET(req: Request) {
  const base = appUrl(req);
  const back = (reason: string) => {
    const res = NextResponse.redirect(`${base}/?auth=${reason}`);
    res.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
    return res;
  };
  if (!accountsEnabled()) return back("unavailable");

  const params = new URL(req.url).searchParams;
  if (params.get("error")) return back("cancelled");
  const store = await cookies();
  const saved = verify<{ state: string; verifier: string; next: string }>(store.get(OAUTH_COOKIE)?.value);
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return back("expired");

  let profile: Profile;
  try {
    const tokenRes = await fetch(google.tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(base),
        grant_type: "authorization_code",
        code_verifier: saved.verifier
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!tokenRes.ok) {
      console.error("[auth] token exchange failed", tokenRes.status);
      return back("failed");
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    const infoRes = await fetch(google.userinfoUrl(), {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!infoRes.ok) return back("failed");
    profile = (await infoRes.json()) as Profile;
  } catch (e) {
    console.error("[auth] google error", e);
    return back("failed");
  }

  const verified = profile.email_verified === true || profile.email_verified === "true";
  if (!profile.email || !profile.sub || !verified) return back("unverified");
  const email = profile.email.toLowerCase();

  const sql = await db();
  const [user] = await sql`
    insert into users (email, name, image, google_sub)
    values (${email}, ${profile.name ?? ""}, ${profile.picture ?? ""}, ${profile.sub})
    on conflict (email) do update set name = excluded.name, image = excluded.image,
      google_sub = coalesce(users.google_sub, excluded.google_sub), last_seen_at = now()
    returning id, email`;

  const res = NextResponse.redirect(`${base}${saved.next}`);
  res.cookies.set(SESSION_COOKIE, sessionToken({ id: Number(user.id), email: user.email }), cookieOptions(SESSION_MAX_AGE));
  res.cookies.set(OAUTH_COOKIE, "", cookieOptions(0));
  return res;
}

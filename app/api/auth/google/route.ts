import { NextResponse } from "next/server";
import { accountsEnabled, appUrl, cookieOptions, OAUTH_COOKIE, randomToken, safeNext, sha256, sign } from "@/lib/session";
import { google, redirectUri } from "@/lib/google";

export const dynamic = "force-dynamic";

// Starts Google sign-in: a random state and PKCE verifier go in a short-lived signed cookie.
export async function GET(req: Request) {
  const base = appUrl(req);
  if (!accountsEnabled()) return NextResponse.redirect(`${base}/?auth=unavailable`);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = randomToken();
  const verifier = randomToken(48);
  const url = new URL(google.authUrl());
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(base),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: sha256(verifier),
    code_challenge_method: "S256",
    prompt: "select_account"
  }).toString();
  const res = NextResponse.redirect(url.toString());
  res.cookies.set(OAUTH_COOKIE, sign({ state, verifier, next, exp: Date.now() + 10 * 60_000 }), cookieOptions(600));
  return res;
}

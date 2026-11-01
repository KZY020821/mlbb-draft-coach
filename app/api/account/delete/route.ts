import { NextResponse } from "next/server";
import { accountsEnabled, appUrl, cookieOptions, currentUser, SESSION_COOKIE } from "@/lib/session";
import { deleteAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

// Deletes the signed-in account. Needs a POST from this site with confirm=DELETE typed in.
export async function POST(req: Request) {
  const base = appUrl(req);
  const back = (msg: string) => NextResponse.redirect(`${base}/account?err=${encodeURIComponent(msg)}`, 303);
  if (!accountsEnabled()) return NextResponse.redirect(`${base}/`, 303);
  // Only from our own pages: browsers send Origin on form posts.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(base).origin) return new Response("Forbidden", { status: 403 });

  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${base}/api/auth/google?next=/account`, 303);
  const form = await req.formData().catch(() => null);
  if (String(form?.get("confirm") ?? "").trim() !== "DELETE") return back("Type DELETE to confirm.");

  await deleteAccount(user);
  const res = NextResponse.redirect(`${base}/?deleted=1`, 303);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}

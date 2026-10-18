import { NextResponse } from "next/server";
import { appUrl, cookieOptions, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST only, so a link or image on another site can't sign people out.
export async function POST(req: Request) {
  const res = NextResponse.redirect(`${appUrl(req)}/`, 303);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}

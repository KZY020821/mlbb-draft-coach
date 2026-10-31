import { db, dbConfigured } from "@/lib/db";
import { accountsEnabled, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Records whether an analysis was helpful (thumbs up or down, with an optional note), for the admin page.
export async function POST(req: Request) {
  if (!dbConfigured()) return Response.json({ ok: false }, { status: 503 });
  let body: { analysisId?: unknown; vote?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { message: "Send JSON." } }, { status: 400 });
  }
  const id = Number(body.analysisId);
  const vote = body.vote === "up" ? 1 : body.vote === "down" ? -1 : 0;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!Number.isInteger(id) || id <= 0 || !vote) return Response.json({ error: { message: "analysisId and vote (up or down) are required." } }, { status: 400 });

  const user = accountsEnabled() ? await currentUser() : null;
  if (accountsEnabled() && !user) return Response.json({ error: { message: "Sign in first." } }, { status: 401 });

  const sql = await db();
  // Only the person who ran the analysis can rate it; a later vote replaces the earlier one.
  const rows = await sql`
    update analyses set feedback = ${vote}, feedback_note = ${note}, feedback_at = now()
    where id = ${id} and status = 'ok' and user_id is not distinct from ${user?.id ?? null}
    returning id`;
  if (!rows.length) return Response.json({ error: { message: "That analysis was not found." } }, { status: 404 });
  return Response.json({ ok: true });
}

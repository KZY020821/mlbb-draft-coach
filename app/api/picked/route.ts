import { db, dbConfigured } from "@/lib/db";
import { accountsEnabled, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Records which suggested hero the player actually locked in, for the admin picks data.
export async function POST(req: Request) {
  if (!dbConfigured()) return Response.json({ ok: false }, { status: 503 });
  let body: { analysisId?: unknown; hero?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { message: "Send JSON." } }, { status: 400 });
  }
  const id = Number(body.analysisId);
  const hero = typeof body.hero === "string" ? body.hero.slice(0, 40) : "";
  if (!Number.isInteger(id) || id <= 0 || !hero) return Response.json({ error: { message: "analysisId and hero are required." } }, { status: 400 });

  const user = accountsEnabled() ? await currentUser() : null;
  if (accountsEnabled() && !user) return Response.json({ error: { message: "Sign in first." } }, { status: 401 });

  const sql = await db();
  // Only the person who ran the analysis can mark it, and only with a hero it suggested.
  const rows = await sql`
    update analyses set picked_hero = ${hero}, picked_at = now()
    where id = ${id} and status = 'ok'
      and user_id is not distinct from ${user?.id ?? null}
      and exists (
        select 1 from jsonb_array_elements(result->'slots') s, jsonb_array_elements(s->'options') o
        where o->>'hero' = ${hero})
    returning id`;
  if (!rows.length) return Response.json({ error: { message: "That analysis or hero was not found." } }, { status: 404 });
  return Response.json({ ok: true });
}

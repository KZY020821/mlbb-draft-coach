import { getContext, dataAgeDays } from "@/lib/context";
import { getMeta } from "@/lib/meta";
import { db, dbConfigured } from "@/lib/db";
import { getApiKey } from "@/lib/deepseek";
import { accountsEnabled, accountsMisconfigured } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { monthSpendUsd } from "@/lib/access";

export const dynamic = "force-dynamic";

// For the uptime check (.github/workflows/uptime.yml). Answers 200 when an analysis could run,
// 503 when something a person must fix is broken. Never calls the AI, so it costs nothing.
// Only yes/no and dates are shown, no settings or amounts.
export async function GET() {
  const ctx = await getContext();
  const meta = getMeta();
  const problems: string[] = [];

  if (!getApiKey()) problems.push("ai_key_missing");
  if (accountsMisconfigured()) problems.push("accounts_misconfigured");

  let database: "ok" | "none" | "error" = "none";
  let aiPaused = false;
  if (dbConfigured()) {
    try {
      const sql = await db();
      await sql`select 1`;
      database = "ok";
      // The switch and the budget are only enforced for signed-in analyses (lib/access.ts gate()),
      // so only report a pause where it actually stops analyses.
      if (accountsEnabled()) {
        const settings = await getSettings();
        aiPaused = !settings.aiEnabled || (await monthSpendUsd()) >= settings.monthlyBudgetUsd;
      }
    } catch {
      database = "error";
      problems.push("database_unreachable");
    }
  }

  const body = {
    ok: problems.length === 0,
    problems,
    accounts: accountsEnabled(),
    database,
    aiPaused,
    patch: ctx.meta.patch,
    patchDataAgeDays: dataAgeDays(ctx),
    proGames: meta.games,
    latestProGame: meta.latestGame,
    checkedAt: new Date().toISOString()
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

import { getContext, dataAgeDays } from "@/lib/context";
import { buildIndex } from "@/lib/heroes";
import { parseRequest, checkAnalysis, type Checked } from "@/lib/draft";
import { buildMessages, retryMessage } from "@/lib/prompt";
import { chatJson, getApiKey, getModel, UpstreamError, addUsage, NO_USAGE, type Usage } from "@/lib/deepseek";
import { accountsEnabled, currentUser, type User } from "@/lib/session";
import { dbConfigured } from "@/lib/db";
import { accountFor, costUsd, gate, logAnalysis, refundTrial, type AccessKind } from "@/lib/access";
import { getSettings, DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { clientId, passcodeOk, rateLimit } from "@/lib/guard";
import { applyRules, getRules } from "@/lib/rules";
import { buildCandidates } from "@/lib/candidates";
import { getMeta } from "@/lib/meta";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function fail(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

const optionCount = (c: Checked) => c.analysis.slots.reduce((n, s) => n + s.options.length, 0);

export async function POST(req: Request) {
  // Count every attempt first, so guessing the passcode is limited too.
  const limit = rateLimit(clientId(req));
  if (!limit.allowed) {
    return fail(429, "rate_limited", `Too many analyses. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`, {
      retryAfterSec: limit.retryAfterSec
    });
  }

  if (!passcodeOk(req.headers.get("x-passcode"))) {
    return fail(401, "passcode", "The passcode is missing or wrong.");
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return fail(400, "bad_request", "The request could not be read.");
  }
  if (raw.length > 4000) return fail(413, "too_large", "The request is too large.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request", "Send the draft as JSON.");
  }

  const ctx = await getContext();
  const index = buildIndex(ctx.heroes);
  const parsed = parseRequest(body, index);
  if (!parsed.ok) return fail(400, "invalid_draft", parsed.message);

  const apiKey = getApiKey();
  if (!apiKey) {
    return fail(503, "not_configured", "The DeepSeek API key is not set on the server. Add DEEPSEEK_API_KEY to the environment.");
  }

  // With accounts switched on, every analysis needs a signed-in user with access.
  let user: User | null = null;
  let access: AccessKind = "open";
  let settings: Settings = DEFAULT_SETTINGS;
  if (accountsEnabled()) {
    user = await currentUser();
    if (!user) return fail(401, "sign_in", "Sign in with Google to run the AI coach. Every account gets free analyses to try it.");
    const g = await gate(user);
    if (!g.ok) return fail(g.status, g.code, g.message, g.extra);
    access = g.access;
    settings = g.settings;
  } else if (dbConfigured()) {
    settings = await getSettings().catch(() => DEFAULT_SETTINGS);
  }

  const started = Date.now();
  let usage: Usage = NO_USAGE;
  const track = async (p: Promise<{ content: string; usage: Usage }>) => {
    const r = await p;
    usage = addUsage(usage, r.usage);
    return r.content;
  };
  const record = (status: "ok" | "error", extra: { retried?: boolean; errorCode?: string; result?: unknown }) =>
    dbConfigured()
      ? logAnalysis({
          userId: user?.id ?? null,
          status,
          access,
          model,
          usage,
          costUsd: costUsd(usage, settings),
          latencyMs: Date.now() - started,
          retried: extra.retried ?? false,
          errorCode: extra.errorCode,
          draft: {
            bans: parsed.draft.bans.map((h) => h.name),
            enemy: parsed.draft.enemy.map((h) => h.name),
            team: Object.fromEntries(parsed.draft.team.map((t) => [t.position, t.hero.name]))
          },
          open: parsed.draft.open,
          result: extra.result
        })
      : Promise.resolve(null);
  const failed = async (errorCode: string, retried = false) => {
    if (access === "trial" && user) await refundTrial(user).catch((e) => console.error("[analyze] refund failed", e));
    await record("error", { errorCode, retried });
  };

  const model = getModel();
  const rules = getRules();
  const applied = applyRules(rules, index, parsed.draft);
  const candidates = buildCandidates(ctx, parsed.draft, applied);
  const messages = buildMessages(ctx, parsed.draft, parsed.need, candidates, applied, rules.principles);

  try {
    let reply = await track(chatJson({ model, messages, apiKey })).catch(async (e) => {
      if (e instanceof UpstreamError && e.code === "empty") return track(chatJson({ model, messages, apiKey }));
      throw e;
    });
    let checked = checkAnalysis(reply, index, parsed.draft, parsed.need, candidates, applied);
    let retried = false;

    // Ask once more if any position lacks 3 usable options or our counter rules were ignored.
    if (!checked.complete || checked.ruleIgnored) {
      retried = true;
      try {
        const second = await track(
          chatJson({
            model,
            messages: [...messages, { role: "assistant", content: reply }, retryMessage(checked.problems)],
            apiKey
          })
        );
        const rechecked = checkAnalysis(second, index, parsed.draft, parsed.need, candidates, applied);
        // Keep the second answer unless it lost usable options.
        if (optionCount(rechecked) >= optionCount(checked)) checked = rechecked;
        reply = second;
      } catch (e) {
        // If the retry fails but the first answer had usable options, show those.
        if (optionCount(checked) === 0) throw e;
      }
    }

    if (optionCount(checked) === 0) {
      await failed("unusable_reply", retried);
      return fail(502, "unusable_reply", "DeepSeek did not return options that fit this draft. Try again.");
    }

    // Attach each option's pro evidence and tags so the page can show why it is there.
    const slots = checked.analysis.slots.map((s) => ({
      position: s.position,
      options: s.options.map((o) => {
        const c = (candidates[s.position] ?? []).find((x) => x.hero === o.hero);
        return { ...o, tags: c?.tags ?? [], evidence: c?.evidence ?? "", score: c?.score ?? null, picks: c?.picks ?? 0, wins: c?.wins ?? 0, focusPicks: c?.focusPicks ?? 0, focusWins: c?.focusWins ?? 0 };
      })
    }));

    const meta = getMeta();
    const analysis = { summary: checked.analysis.summary, plan: checked.analysis.plan, slots };
    const analysisId = await record("ok", { retried, result: analysis });
    const account = user ? await accountFor(user).catch(() => null) : null;
    return Response.json({
      analysis,
      analysisId,
      account,
      need: parsed.need,
      partial: !checked.complete,
      open: parsed.draft.open,
      rules: applied,
      meta: {
        patch: ctx.meta.patch,
        season: ctx.meta.season,
        dataAsOf: ctx.meta.dataAsOf,
        dataAgeDays: dataAgeDays(ctx),
        model,
        retried,
        pro: {
          league: meta.league,
          games: meta.games,
          focusTeam: meta.focusTeam,
          focusGames: meta.focusGames,
          latestGame: meta.latestGame,
          source: meta.source.name,
          license: meta.source.license
        }
      }
    });
  } catch (e) {
    await failed(e instanceof UpstreamError ? e.code : "server_error");
    if (e instanceof UpstreamError) {
      const status = e.code === "busy" ? 503 : e.code === "timeout" ? 504 : 502;
      // Key and billing problems are for the site owner, so keep the visitor message generic.
      const message =
        e.code === "bad_key" || e.code === "no_balance"
          ? "The analysis service is not available right now. Tell the site owner."
          : e.message;
      if (e.code === "bad_key" || e.code === "no_balance") console.error("[analyze]", e.code, e.message);
      return fail(status, e.code, message);
    }
    console.error("[analyze] unexpected", e);
    return fail(500, "server_error", "Something went wrong on the server.");
  }
}

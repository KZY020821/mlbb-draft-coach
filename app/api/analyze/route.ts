import { getContext, dataAgeDays } from "@/lib/context";
import { buildIndex } from "@/lib/heroes";
import { parseRequest, checkAnalysis } from "@/lib/draft";
import { buildMessages, retryMessage } from "@/lib/prompt";
import { chatJson, getApiKey, getModel, UpstreamError } from "@/lib/deepseek";
import { clientId, passcodeOk, rateLimit } from "@/lib/guard";
import { applyRules, getRules } from "@/lib/rules";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function fail(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

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

  const model = getModel();
  const rules = getRules();
  const applied = applyRules(rules, index, parsed.draft);
  const messages = buildMessages(ctx, parsed.draft, parsed.need, applied, rules.principles);

  try {
    let reply = await chatJson({ model, messages, apiKey }).catch(async (e) => {
      if (e instanceof UpstreamError && e.code === "empty") return chatJson({ model, messages, apiKey });
      throw e;
    });
    let checked = checkAnalysis(reply, index, parsed.draft, parsed.need, applied);
    let retried = false;

    // Ask once more if picks are missing or our counter rules were ignored.
    if (checked.analysis.picks.length < parsed.need || checked.ruleIgnored) {
      retried = true;
      try {
        const second = await chatJson({
          model,
          messages: [...messages, { role: "assistant", content: reply }, retryMessage(checked.problems)],
          apiKey
        });
        const rechecked = checkAnalysis(second, index, parsed.draft, parsed.need, applied);
        // Keep the second answer unless it lost usable picks.
        if (rechecked.analysis.picks.length >= checked.analysis.picks.length) checked = rechecked;
      } catch (e) {
        // If the retry fails but the first answer had usable picks, show those.
        if (checked.analysis.picks.length === 0) throw e;
      }
    }

    if (checked.analysis.picks.length === 0) {
      return fail(502, "unusable_reply", "DeepSeek did not return a pick that fits this draft. Try again.");
    }

    return Response.json({
      analysis: checked.analysis,
      need: parsed.need,
      partial: checked.analysis.picks.length < parsed.need,
      rules: applied,
      meta: {
        patch: ctx.meta.patch,
        season: ctx.meta.season,
        dataAsOf: ctx.meta.dataAsOf,
        dataAgeDays: dataAgeDays(ctx),
        model,
        retried
      }
    });
  } catch (e) {
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

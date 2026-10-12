import type { Message } from "./prompt";

const PLACEHOLDER = "your-deepseek-key-here";

export function getApiKey(): string | null {
  const key = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  if (!key || key === PLACEHOLDER) return null;
  return key;
}

export function getModels() {
  return {
    fast: (process.env.DEEPSEEK_MODEL || "deepseek-flash").trim(),
    deep: (process.env.DEEPSEEK_DEEP_MODEL || "").trim()
  };
}

export class UpstreamError extends Error {
  constructor(
    public code: "bad_key" | "no_balance" | "busy" | "timeout" | "empty" | "upstream",
    message: string
  ) {
    super(message);
  }
}

// One request to DeepSeek's OpenAI-compatible chat endpoint in JSON mode.
export async function chatJson(opts: { model: string; messages: Message[]; apiKey: string }): Promise<string> {
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        response_format: { type: "json_object" },
        max_tokens: 3000,
        temperature: 0.3,
        stream: false
      }),
      signal: AbortSignal.timeout(50_000)
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new UpstreamError("timeout", "DeepSeek took too long to answer.");
    }
    throw new UpstreamError("upstream", "Could not reach DeepSeek.");
  }

  if (res.status === 401) throw new UpstreamError("bad_key", "DeepSeek rejected the API key.");
  if (res.status === 402) throw new UpstreamError("no_balance", "The DeepSeek account has no balance left.");
  if (res.status === 429) throw new UpstreamError("busy", "DeepSeek is rate limiting requests. Try again shortly.");
  if (!res.ok) throw new UpstreamError("upstream", `DeepSeek returned an error (${res.status}).`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new UpstreamError("upstream", "DeepSeek sent a reply that could not be read.");
  }
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new UpstreamError("empty", "DeepSeek returned an empty reply.");
  }
  return content;
}

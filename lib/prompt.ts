import type { Context } from "./context";
import type { Draft } from "./draft";

export type Message = { role: "system" | "user" | "assistant"; content: string };

function tierTable(ctx: Context): string {
  return ["S", "A", "B", "C", "D"]
    .map((t) => {
      const list = ctx.heroes
        .filter((h) => h.tier === t)
        .map((h) => `${h.name} (${h.roles.join("/")})`)
        .join(", ");
      return `${t}: ${list}`;
    })
    .join("\n");
}

function proSignals(ctx: Context): string {
  const lines = ctx.heroes
    .filter((h) => h.pro || h.banRate)
    .map((h) => {
      const parts = [
        h.banRate ? `banned in ${h.banRate}% of games` : "",
        h.pro === "ban" ? "priority ban" : h.pro === "pick" ? "pro pick" : "",
        h.lanes?.length ? `lane: ${h.lanes.join("/")}` : "",
        h.note ?? ""
      ].filter(Boolean);
      return `- ${h.name}: ${parts.join(". ")}`;
    });
  return lines.join("\n");
}

function list(heroes: { name: string; roles: string[] }[]): string {
  return heroes.length ? heroes.map((h) => `${h.name} (${h.roles.join("/")})`).join(", ") : "none";
}

export function buildMessages(ctx: Context, draft: Draft, need: number): Message[] {
  const m = ctx.meta;
  const system = [
    "You are an expert Mobile Legends: Bang Bang draft analyst. A team is in the middle of a draft and needs help choosing its remaining pick or picks.",
    "",
    "Rules:",
    "- Use only the data below and the draft you are given. You cannot browse the web. If the data does not cover something, say so instead of guessing.",
    "- Never recommend a hero that is banned or already picked. Use hero names exactly as they appear in the roster below.",
    "- The patch notes are newer than the tier table. If they conflict, follow the patch notes.",
    `- These heroes are recent and their abilities were not verified, so do not describe their abilities in detail: ${m.unverifiedKits.join(", ")}.`,
    "- Do not invent win rates, statistics or patch changes.",
    "- Weigh what the enemy team can do, what our team still lacks, which heroes are likely to be contested, and the pro draft signals.",
    "",
    "PATCH CONTEXT",
    `Patch ${m.patch} (${m.season}), opened ${m.patchOpened}. Data last updated ${m.dataAsOf}.`,
    `Patch notes: ${ctx.patchNotes || "none"}`,
    "",
    "ROSTER AND TIERS",
    tierTable(ctx),
    "",
    `PRO DRAFT SIGNALS (${m.proPeriod})`,
    proSignals(ctx),
    "",
    "OUTPUT",
    "Reply with one JSON object and nothing else. It must have this shape (the values below are only examples):",
    JSON.stringify(
      {
        summary: "Two sentences on what the enemy draft threatens and what our team lacks.",
        confidence: "medium",
        picks: [
          { hero: "Exact Hero Name", role: "Lane or role it fills", why: "One or two sentences.", risk: "One short sentence." }
        ],
        backups: [{ hero: "Exact Hero Name", why: "One short sentence." }],
        plan: "One or two sentences on pick order or lane assignments."
      },
      null,
      2
    ),
    'confidence must be "low", "medium" or "high" and reflects how much the supplied data supports your answer.'
  ].join("\n");

  const unavailable = [...draft.bans, ...draft.enemy, ...draft.team].map((h) => h.name);
  const user = [
    `Banned heroes: ${list(draft.bans)}`,
    `Enemy picks: ${list(draft.enemy)}`,
    `Our picks so far: ${list(draft.team)}`,
    `Heroes that are not available: ${unavailable.length ? unavailable.join(", ") : "none"}`,
    "",
    `Our team has ${5 - draft.team.length} pick${5 - draft.team.length === 1 ? "" : "s"} left. Recommend exactly ${need} hero${need === 1 ? "" : "es"} in "picks"${
      need === 2 ? ", listed in the order the team should lock them in" : ""
    }, then up to 3 "backups". Return the JSON object only.`
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

export function retryMessage(problems: string[]): Message {
  return {
    role: "user",
    content:
      "Your last reply had problems:\n" +
      problems.map((p) => `- ${p}`).join("\n") +
      "\nReturn the corrected JSON object only. Use only heroes from the roster that are still available."
  };
}

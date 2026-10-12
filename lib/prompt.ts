import type { Context, Hero } from "./context";
import { teamHeroes, type Draft } from "./draft";
import { POSITIONS, POSITION_LABEL } from "./positions";
import type { AppliedRule } from "./rules";

export type Message = { role: "system" | "user" | "assistant"; content: string };

function heroLabel(h: Hero): string {
  return `${h.name} (${h.roles.join("/")}${h.lanes?.length ? `; lanes ${h.lanes.join("/")}` : ""})`;
}

function tierTable(ctx: Context): string {
  return ["S", "A", "B", "C", "D"]
    .map((t) => `${t}: ${ctx.heroes.filter((h) => h.tier === t).map(heroLabel).join(", ")}`)
    .join("\n");
}

function proSignals(ctx: Context): string {
  return ctx.heroes
    .filter((h) => h.pro || h.banRate)
    .map((h) => {
      const parts = [
        h.banRate ? `banned in ${h.banRate}% of games` : "",
        h.pro === "ban" ? "priority ban" : h.pro === "pick" ? "pro pick" : "",
        h.note ?? ""
      ].filter(Boolean);
      return `- ${h.name}: ${parts.join(". ")}`;
    })
    .join("\n");
}

function list(heroes: Hero[]): string {
  return heroes.length ? heroes.map(heroLabel).join(", ") : "none";
}

function rulesBlock(applied: AppliedRule[]): string {
  if (!applied.length) return "";
  const lines = applied.map((r) => {
    if (r.teamHas) return `- Enemy picked ${r.enemy}. Our team already has ${r.teamHas}, which counters it.`;
    const parts = [`- Enemy picked ${r.enemy}.`];
    if (r.available.length) parts.push(`Counter with: ${r.available.join(" or ")}.`);
    else parts.push("None of our counters for it can be picked right now.");
    if (r.unavailable.length) parts.push(`(${r.unavailable.join(", ")} banned or taken.)`);
    if (r.offPosition.length) parts.push(`(${r.offPosition.join(", ")} not played in our open positions.)`);
    if (r.why) parts.push(`Reason: ${r.why}`);
    return parts.join(" ");
  });
  return [
    "",
    "OUR TEAM'S COUNTER RULES",
    "These come from our team's coach and are known, reliable counters. When a counter below is available, put it in picks for the open position it is played in.",
    "If you leave out an available counter, explain why in plan.",
    ...lines
  ].join("\n");
}

export function buildMessages(
  ctx: Context,
  draft: Draft,
  need: number,
  applied: AppliedRule[] = [],
  principles: string[] = []
): Message[] {
  const m = ctx.meta;
  const system = [
    "You are an expert Mobile Legends: Bang Bang draft analyst. A team is in the middle of a draft and needs help choosing its remaining pick or picks.",
    "",
    "Rules:",
    "- Use only the data below and the draft you are given. You cannot browse the web. If the data does not cover something, say so instead of guessing.",
    "- Never recommend a hero that is banned or already picked. Use hero names exactly as they appear in the roster below.",
    "- The roles in the roster are correct. Describe each hero by its listed roles: for example, do not call a hero tanky or a frontliner unless its roles include Tank.",
    "- Our team has five positions: Roam, Marksman (gold lane), Jungler, Mage (mid lane) and Fighter (EXP lane). Recommend heroes only for our open positions, and only heroes that are played there.",
    "- When a hero's lanes are listed, it is played only in those lanes. Without lanes, use its roles: Roam is played by Tank or Support heroes; Marksman by Marksman heroes; Mage by Mage heroes; Fighter (EXP) by Fighter or Tank heroes; Jungler by Assassin, Fighter or Tank heroes.",
    "- The patch notes are newer than the tier table. If they conflict, follow the patch notes.",
    `- These heroes are recent and their abilities were not verified, so do not describe their abilities in detail: ${m.unverifiedKits.join(", ")}.`,
    "- Do not invent win rates, statistics or patch changes.",
    "- Weigh what the enemy team can do, what our team still lacks, which heroes are likely to be contested, and the pro draft signals.",
    ...(principles.length ? ["", "OUR TEAM'S DRAFT PRINCIPLES (follow these)", ...principles.map((p) => `- ${p}`)] : []),
    "",
    "PATCH CONTEXT",
    `Patch ${m.patch} (${m.season}), opened ${m.patchOpened}. Data last updated ${m.dataAsOf}.`,
    `Patch notes: ${ctx.patchNotes || "none"}`,
    "",
    "ROSTER AND TIERS (name, roles, and lanes where known)",
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
        picks: [{ hero: "Exact Hero Name", position: "Roam", why: "One or two sentences.", risk: "One short sentence." }],
        backups: [{ hero: "Exact Hero Name", position: "Roam", why: "One short sentence." }],
        plan: "One or two sentences on pick order."
      },
      null,
      2
    ),
    'position must be one of our open positions, written as "Roam", "Marksman", "Jungler", "Mage" or "Fighter".',
    'confidence must be "low", "medium" or "high" and reflects how much the supplied data supports your answer.'
  ].join("\n");

  const byPosition = POSITIONS.map((p) => {
    const t = draft.team.find((x) => x.position === p);
    return `- ${POSITION_LABEL[p]}: ${t ? heroLabel(t.hero) : "OPEN"}`;
  });
  const openNames = draft.open.map((p) => POSITION_LABEL[p]);
  const unavailable = [...draft.bans, ...draft.enemy, ...teamHeroes(draft)].map((h) => h.name);

  let ask: string;
  if (draft.open.length <= 2) {
    ask = `Recommend exactly one hero for each open position (${openNames.join(" and ")}), so ${need} hero${need === 1 ? "" : "es"} in "picks"${
      need === 2 ? ", listed in the order the team should lock them in" : ""
    }.`;
  } else {
    ask = `Our team has ${draft.open.length} open positions (${openNames.join(", ")}). Recommend exactly 2 heroes in "picks" for the 2 open positions that matter most right now, one hero per position, in the order the team should lock them in.`;
  }

  const user = [
    `Banned heroes: ${list(draft.bans)}`,
    `Enemy picks: ${list(draft.enemy)}`,
    "Our picks by position:",
    ...byPosition,
    `Open positions: ${openNames.join(", ")}`,
    `Heroes that are not available: ${unavailable.length ? unavailable.join(", ") : "none"}`,
    rulesBlock(applied),
    "",
    `${ask} Then give up to 3 "backups" that also fit an open position. Return the JSON object only.`
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
      "\nReturn the corrected JSON object only. Use only available heroes that are played in our open positions."
  };
}

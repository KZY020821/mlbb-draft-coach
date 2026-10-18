import type { Candidate } from "./candidates";
import type { Context, Hero } from "./context";
import { OPTIONS_PER_POSITION, teamHeroes, type Draft } from "./draft";
import { getMeta, hasMeta } from "./meta";
import { POSITIONS, POSITION_LABEL, type Position } from "./positions";
import type { AppliedRule } from "./rules";

export type Message = { role: "system" | "user" | "assistant"; content: string };

function heroLabel(h: Hero): string {
  return `${h.name} (${h.roles.join("/")})`;
}

function list(heroes: Hero[]): string {
  return heroes.length ? heroes.map(heroLabel).join(", ") : "none";
}

function rulesBlock(applied: AppliedRule[]): string {
  if (!applied.length) return "";
  const lines = applied.map((r) => {
    if (r.teamHas) return `- Enemy picked ${r.enemy}. Our team already has ${r.teamHas}, which counters it.`;
    if (!r.available.length) return `- Enemy picked ${r.enemy}. None of our counters for it fits an open position or is still available.`;
    return `- Enemy picked ${r.enemy}. Counter with: ${r.available.join(" or ")}.${r.why ? ` Reason: ${r.why}` : ""}`;
  });
  return [
    "",
    "OUR COACH'S COUNTER RULES (known, reliable counters)",
    "When a counter below is on a candidate list, include it among that position's options, ranked high unless the evidence clearly says otherwise.",
    ...lines
  ].join("\n");
}

function candidateBlock(position: Position, list: Candidate[]): string {
  return [
    `${POSITION_LABEL[position]} — choose ${OPTIONS_PER_POSITION} from these candidates only:`,
    ...list.map((c) => `- ${c.hero} (${c.roles.join("/")}; tier ${c.tier || "-"}; score ${c.score}): ${c.evidence}`)
  ].join("\n");
}

export function buildMessages(
  ctx: Context,
  draft: Draft,
  need: number,
  candidates: Partial<Record<Position, Candidate[]>>,
  applied: AppliedRule[] = [],
  principles: string[] = []
): Message[] {
  const m = ctx.meta;
  const meta = getMeta();
  const proLine = hasMeta(meta)
    ? `${meta.league}: ${meta.games} pro games up to ${meta.latestGame}, including ${meta.focusGames} by ${meta.focusTeam}. Positions in the pro data are inferred from picks.`
    : "No pro league data is loaded yet, so the candidates come from the tier list only.";
  const topBans = Object.entries(meta.heroes)
    .sort((a, b) => b[1].bans - a[1].bans)
    .slice(0, 10)
    .filter(([, h]) => h.bans > 0)
    .map(([name, h]) => `${name} (${h.bans})`)
    .join(", ");

  const system = [
    "You are an expert Mobile Legends: Bang Bang draft analyst. A team is in the middle of a draft and needs options for its remaining position or positions.",
    "",
    "How to decide:",
    `- For each open position, choose exactly ${OPTIONS_PER_POSITION} heroes from that position's candidate list, ranked best first. Never pick a hero that is not on the list.`,
    "- Each candidate has a score (0-100) built from the whole league's pro data: how much pros play it in that position, its win rate there, how its team did against the heroes the enemy has picked now, and how it did alongside our current picks. Candidates are listed best score first, after any of our coach's counters. Start from the top of the list and move a lower hero up only for a clear reason in this draft (a counter to a specific enemy hero, or something our team lacks).",
    "- Counter picks matter as much as popularity: weigh the head-to-head records against the enemy's current picks and what the enemy draft threatens.",
    "- One team's record is not a reason on its own. Treat any single team's picks, and any sample of 1 to 3 games, as weak evidence.",
    "- Offer three options that a player could each realistically play, so a player can choose the hero they play best. Avoid three near-identical heroes when a strong alternative style exists on the list.",
    "- The roles listed are correct. Do not call a hero tanky or a frontliner unless its roles include Tank.",
    `- These heroes are recent and their abilities were not verified, so do not describe their abilities in detail: ${m.unverifiedKits.join(", ")}.`,
    "- Use only the data given. You cannot browse the web. Do not invent statistics; quote only numbers that appear in the evidence.",
    '- confidence per option: "high" when the pro evidence and the draft both support it, "medium" when one does, "low" otherwise.',
    ...(principles.length ? ["", "OUR TEAM'S DRAFT PRINCIPLES (follow these)", ...principles.map((p) => `- ${p}`)] : []),
    "",
    "CONTEXT",
    proLine,
    ...(topBans ? [`Most banned in that league: ${topBans}.`] : []),
    `Patch ${m.patch} (${m.season}). Patch notes: ${ctx.patchNotes || "none"}`,
    "",
    "OUTPUT",
    "Reply with one JSON object and nothing else, shaped like this example (values are examples):",
    JSON.stringify(
      {
        summary: "Two sentences on what the enemy draft threatens and what our team still needs.",
        slots: [
          {
            position: "Roam",
            options: [
              { hero: "Exact Hero Name", confidence: "high", why: "One sentence citing the evidence.", risk: "One short sentence." },
              { hero: "Exact Hero Name", confidence: "medium", why: "One sentence.", risk: "One short sentence." },
              { hero: "Exact Hero Name", confidence: "medium", why: "One sentence.", risk: "One short sentence." }
            ]
          }
        ],
        plan: "One sentence on which position to lock first."
      },
      null,
      2
    ),
    'position must be written as "Roam", "Marksman", "Jungler", "Mage" or "Fighter".'
  ].join("\n");

  const byPosition = POSITIONS.map((p) => {
    const t = draft.team.find((x) => x.position === p);
    return `- ${POSITION_LABEL[p]}: ${t ? heroLabel(t.hero) : "OPEN"}`;
  });
  const openNames = draft.open.map((p) => POSITION_LABEL[p]);
  const unavailable = [...draft.bans, ...draft.enemy, ...teamHeroes(draft)].map((h) => h.name);
  const slotsAsked = Object.keys(candidates) as Position[];
  const ask =
    draft.open.length <= 2
      ? `Give one slot per open position (${openNames.join(" and ")}), each with ${OPTIONS_PER_POSITION} options.`
      : `Our team has ${draft.open.length} open positions. Give slots for the 2 that matter most right now, chosen from those with candidates below, each with ${OPTIONS_PER_POSITION} options, the slot to lock first listed first.`;

  const user = [
    `Banned heroes: ${list(draft.bans)}`,
    `Enemy picks: ${list(draft.enemy)}`,
    "Our picks by position:",
    ...byPosition,
    `Open positions: ${openNames.join(", ")}`,
    `Not available (banned or picked): ${unavailable.length ? unavailable.join(", ") : "none"}`,
    rulesBlock(applied),
    "",
    "CANDIDATES (with pro evidence)",
    ...slotsAsked.map((p) => candidateBlock(p, candidates[p] ?? [])),
    "",
    `${ask} Return the JSON object only.`
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
      `\nReturn the corrected JSON object only: ${OPTIONS_PER_POSITION} options per slot, each from that position's candidate list.`
  };
}

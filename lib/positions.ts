import type { Hero } from "./context";

// Our team's five positions, in the order shown on the form.
export const POSITIONS = ["roam", "marksman", "jungler", "mage", "fighter"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  roam: "Roam",
  marksman: "Marksman (gold lane)",
  jungler: "Jungler",
  mage: "Mage (mid lane)",
  fighter: "Fighter (EXP lane)"
};

// The lane name used in the patch data for each position.
const LANE: Record<Position, string> = {
  roam: "Roam",
  marksman: "Gold",
  jungler: "Jungle",
  mage: "Mid",
  fighter: "EXP"
};

// Hero roles that are normally played in each position, used when the
// patch data does not list a hero's lanes.
const ROLE_FIT: Record<Position, string[]> = {
  roam: ["Tank", "Support"],
  marksman: ["Marksman"],
  // Mage or marksman junglers (e.g. Alice) are covered by their listed lanes.
  jungler: ["Assassin", "Fighter", "Tank"],
  mage: ["Mage"],
  fighter: ["Fighter", "Tank"]
};

export function positionFromText(text: unknown): Position | undefined {
  if (typeof text !== "string") return undefined;
  const t = text.toLowerCase();
  if (t.includes("roam") || t.includes("support")) return "roam";
  if (t.includes("marksman") || t.includes("gold")) return "marksman";
  if (t.includes("jungl")) return "jungler";
  if (t.includes("mage") || t.includes("mid")) return "mage";
  if (t.includes("fighter") || t.includes("exp")) return "fighter";
  return undefined;
}

// Whether a hero is played in a position. Known lanes from the patch data win;
// otherwise the hero's roles decide.
export function fitsPosition(hero: Hero, position: Position): boolean {
  if (hero.lanes?.length) return hero.lanes.includes(LANE[position]);
  return hero.roles.some((r) => ROLE_FIT[position].includes(r));
}

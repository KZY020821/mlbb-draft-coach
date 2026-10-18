import type { Hero } from "./context";

export type HeroIndex = Map<string, Hero>;

// Other spellings players type, mapped to the roster name. Matching ignores case, spaces and punctuation.
export const HERO_ALIASES: Record<string, string> = {
  Soyou: "Suyou"
};

export function idOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function buildIndex(heroes: Hero[]): HeroIndex {
  const index: HeroIndex = new Map();
  for (const h of heroes) index.set(idOf(h.name), h);
  for (const [alias, name] of Object.entries(HERO_ALIASES)) {
    const hero = index.get(idOf(name));
    if (hero && !index.has(idOf(alias))) index.set(idOf(alias), hero);
  }
  return index;
}

export function resolveHero(index: HeroIndex, name: unknown): Hero | undefined {
  if (typeof name !== "string") return undefined;
  const id = idOf(name.trim());
  return id ? index.get(id) : undefined;
}

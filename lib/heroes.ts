import type { Hero } from "./context";

export type HeroIndex = Map<string, Hero>;

function idOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function buildIndex(heroes: Hero[]): HeroIndex {
  const index: HeroIndex = new Map();
  for (const h of heroes) index.set(idOf(h.name), h);
  return index;
}

export function resolveHero(index: HeroIndex, name: unknown): Hero | undefined {
  if (typeof name !== "string") return undefined;
  const id = idOf(name.trim());
  return id ? index.get(id) : undefined;
}

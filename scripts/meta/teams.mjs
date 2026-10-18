// Finds each pro team's logo on Liquipedia. Pure functions with no Node or browser APIs.
//
// A team's Liquipedia page has {{Infobox team |image=... |imagedark=...}}. The site is dark,
// so the dark-mode logo is preferred when the page has one.

// Reads one parameter of the first {{Infobox team ...}} on a page.
function infoboxParam(wikitext, key) {
  const start = wikitext.search(/\{\{\s*Infobox[ _]team/i);
  if (start < 0) return "";
  const m = wikitext.slice(start).match(new RegExp("\\|\\s*" + key + "\\s*=\\s*([^|\\n}]*)"));
  return m ? m[1].trim() : "";
}

// The logo file name on a team page ("Team Liquid 2024 darkmode.png"), or "" when there is none.
export function infoboxLogo(wikitext) {
  const file = infoboxParam(wikitext, "imagedark") || infoboxParam(wikitext, "image");
  return file.replace(/^(File|Image):/i, "").trim();
}

// Page titles to try for a team, best first: a hand-set page from meta-config.json, then the
// names the match pages used, then the app's name for the team. Redirects are followed.
export function pagesToTry(team, override) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const out = [override, ...(team.pages ?? []), team.name].filter(Boolean).map((s) => cap(String(s).trim()));
  return [...new Set(out)];
}

// Region words in team names, by league id.
const REGION_WORDS = { id: ["id", "indonesia"], ph: ["ph", "philippines"], my: ["my", "malaysia"] };

// What to search for when a team's page isn't found by its name: the name without its region tag.
export function searchTerm(name) {
  const words = String(name).trim().split(/\s+/);
  const last = words.at(-1)?.toLowerCase();
  return words.length > 1 && Object.values(REGION_WORDS).some((w) => w.includes(last)) ? words.slice(0, -1).join(" ") : words.join(" ");
}

// Search results to try for a team, best first: no subpages, never a page for another
// league's region, and pages naming this team's region ahead of the rest.
export function rankSearchTitles(titles, league, regions = {}) {
  const own = new Set([...(REGION_WORDS[league] ?? []), String(regions[league] ?? "").toLowerCase()].filter(Boolean));
  const other = new Set(
    Object.entries(REGION_WORDS)
      .filter(([id]) => id !== league)
      .flatMap(([id, w]) => [...w, String(regions[id] ?? "").toLowerCase()])
      .filter((w) => w && !own.has(w))
  );
  const words = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return titles
    .filter((t) => !t.includes("/") && !words(t).some((w) => other.has(w)))
    .map((t, i) => ({ t, i, mine: words(t).some((w) => own.has(w)) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.i - b.i)
    .map((x) => x.t);
}

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

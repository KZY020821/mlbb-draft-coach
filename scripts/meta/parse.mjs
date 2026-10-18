// Parses Liquipedia match wikitext ({{Match}} with {{Map}} games) into plain game records.
// Pure functions with no Node or browser APIs, so the same code runs in the weekly job and in tests.

// Liquipedia short names that do not match a roster name directly.
export const HERO_ALIASES = {
  guin: "Guinevere",
  lapu: "Lapu-Lapu",
  lapulapu: "Lapu-Lapu",
  yss: "Yi Sun-shin",
  yz: "Yu Zhong",
  xborg: "X.Borg",
  popol: "Popol & Kupa",
  pnk: "Popol & Kupa",
  change: "Chang'e",
  gatot: "Gatotkaca",
  luoyi: "Luo Yi"
};

// Spellings of the same team seen on Liquipedia pages, mapped to one name.
const TEAM_ALIASES = {
  onicphilippines: "ONIC PH",
  onicph: "ONIC PH",
  apbren: "AP.Bren",
  auroraph: "Aurora PH",
  auroragamingph: "Aurora PH",
  teamfalconsph: "Team Falcons PH",
  teamliquidph: "Team Liquid PH",
  tncproteam: "TNC Pro Team",
  twistedmindsph: "Twisted Minds PH",
  omegaesports: "Omega Esports",
  smartomega: "Omega Esports"
};

export const idOf = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]/g, "");

export function teamName(raw) {
  const key = idOf(raw);
  return TEAM_ALIASES[key] ?? String(raw).trim();
}

// Returns each balanced {{Name ...}} block in text, in order.
export function templates(text, name) {
  const out = [];
  const open = "{{" + name;
  let i = 0;
  while ((i = text.indexOf(open, i)) !== -1) {
    const next = text[i + open.length];
    if (next && /[A-Za-z0-9]/.test(next)) {
      i += open.length;
      continue; // e.g. {{Matchlist when looking for {{Match
    }
    let depth = 0;
    let j = i;
    for (; j < text.length - 1; j++) {
      if (text[j] === "{" && text[j + 1] === "{") {
        depth++;
        j++;
      } else if (text[j] === "}" && text[j + 1] === "}") {
        depth--;
        j++;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

function param(block, key) {
  const m = block.match(new RegExp("\\|\\s*" + key + "\\s*=\\s*([^|\\n}]*)"));
  return m ? m[1].trim() : "";
}

// Removes nested {{Map ...}} blocks so match-level params are read from the match itself.
function withoutMaps(match) {
  let out = match;
  for (const m of templates(match, "Map")) out = out.replace(m, "");
  return out;
}

// Handles "October 9,2026", "Oct 9, 2026", "Sept. 5 , 2026" and ISO "2026-10-09".
export function parseDate(raw) {
  const s = String(raw);
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/([A-Za-z]+)\.?\s+(\d{1,2})\s*,\s*(\d{4})/);
  if (!m) return "";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mo = months.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mo < 0) return "";
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// games: [{ match, date, game, teams:[a,b], teamPages:[a,b], sides:[...], winner: 0|1, picks:[[5],[5]], bans:[[..],[..]] }]
// teamPages keeps the names as written on the page (usually the team's Liquipedia page), for finding logos.
// Heroes are left as Liquipedia ids here; the builder maps them to roster names.
export function parseMatches(wikitext, source) {
  const games = [];
  let matchNo = 0;
  for (const match of templates(wikitext, "Match")) {
    const head = withoutMaps(match);
    const opp = [...head.matchAll(/opponent([12])\s*=\s*\{\{TeamOpponent\|([^}|]+)/g)];
    const t1 = opp.find((o) => o[1] === "1");
    const t2 = opp.find((o) => o[1] === "2");
    if (!t1 || !t2) continue;
    matchNo++;
    const teams = [teamName(t1[2]), teamName(t2[2])];
    const teamPages = [t1[2].trim(), t2[2].trim()];
    const date = parseDate(param(head, "date"));
    let game = 0;
    for (const map of templates(match, "Map")) {
      const winner = param(map, "winner");
      const picks = [1, 2].map((t) => [1, 2, 3, 4, 5].map((n) => param(map, `t${t}h${n}`)).filter(Boolean));
      if (!(winner === "1" || winner === "2") || picks[0].length !== 5 || picks[1].length !== 5) continue;
      game++;
      games.push({
        source,
        match: `${source}#${matchNo}`,
        date,
        game,
        teams,
        teamPages,
        sides: [param(map, "team1side"), param(map, "team2side")],
        winner: winner === "1" ? 0 : 1,
        picks,
        bans: [1, 2].map((t) => [1, 2, 3, 4, 5].map((n) => param(map, `t${t}b${n}`)).filter(Boolean))
      });
    }
  }
  return games;
}

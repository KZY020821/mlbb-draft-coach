// Local stand-in for the DeepSeek chat API, used only for testing.
import http from "node:http";

let mode = "good";
let calls = 0;
let last = null;

// Heroes the mock suggests for each position (all are played there).
const POOL = {
  Roam: ["Khufra", "Estes", "Floryn", "Minotaur", "Rafaela"],
  Marksman: ["Melissa", "Karrie", "Obsidia", "Hanabi"],
  Jungler: ["Hirara", "Ling", "Lukas", "Nolan"],
  Mage: ["Valir", "Gord", "Zhuxin", "Kagura"],
  Fighter: ["Argus", "Lapu-Lapu", "Arlott", "Esmeralda"]
};

function goodReply(userText) {
  const unavailable = ((userText.match(/Heroes that are not available: (.*)/) || [])[1] || "").split(", ");
  const open = ((userText.match(/Open positions: (.*)/) || [])[1] || "Roam")
    .split(", ")
    .map((p) => p.split(" ")[0]);
  const need = Math.min(2, open.length);
  const free = (pos) => POOL[pos].filter((h) => !unavailable.includes(h));
  const picks = open.slice(0, need).map((position) => ({ hero: free(position)[0], position, why: "Fits the draft.", risk: "May be banned next time." }));

  if (mode === "follow_rules") {
    const m = userText.match(/Counter with: ([^.]+)\./);
    if (m) {
      const counter = m[1].split(" or ")[0];
      const position = open.includes("Mage") ? "Mage" : open[0];
      const i = picks.findIndex((p) => p.position === position);
      picks[i >= 0 ? i : 0] = { hero: counter, position, why: "Coach's counter.", risk: "None." };
    }
  }
  const backups = free(open[0]).slice(1, 3).map((hero) => ({ hero, position: open[0], why: "Reasonable alternative." }));
  return { summary: "The enemy has strong dive and your team lacks a frontline.", confidence: "medium", picks, backups, plan: "Lock the open positions." };
}

http
  .createServer((req, res) => {
    if (req.url === "/__mode" && req.method === "POST") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        mode = JSON.parse(b).mode;
        calls = 0;
        res.end("ok");
      });
      return;
    }
    if (req.url === "/__last") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ calls, last }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls++;
      const parsed = JSON.parse(body || "{}");
      last = { auth: req.headers.authorization, url: req.url, body: parsed };
      const userText = parsed.messages.filter((m) => m.role === "user")[0].content;
      const reply = (content) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
      };
      if (mode === "401") { res.statusCode = 401; return res.end("{}"); }
      if (mode === "402") { res.statusCode = 402; return res.end("{}"); }
      if (mode === "429") { res.statusCode = 429; return res.end("{}"); }
      if (mode === "not_json") return reply("Sorry, I cannot help with that.");
      if (mode === "empty_then_good") return calls === 1 ? reply("") : reply(JSON.stringify(goodReply(userText)));
      if (mode === "always_bad") {
        return reply(JSON.stringify({ summary: "x", picks: [{ hero: "Notahero", position: "Roam", why: "x" }], backups: [] }));
      }
      if (mode === "bad_then_good" && calls === 1) {
        const g = goodReply(userText);
        g.picks[0].hero = "Notahero";
        g.picks.push({ hero: "Hayabusa", position: "Jungler", why: "banned", risk: "x" });
        return reply(JSON.stringify(g));
      }
      if (mode === "wrong_position_then_good" && calls === 1) {
        const g = goodReply(userText);
        // Barats is played in Jungle/EXP, so put him in the last open position (Roam or Mage in the tests).
        const i = g.picks.length - 1;
        g.picks[i] = { hero: "Barats", position: g.picks[i].position, why: "Tanky.", risk: "x" };
        return reply(JSON.stringify(g));
      }
      return reply(JSON.stringify(goodReply(userText)));
    });
  })
  .listen(4010, "127.0.0.1", () => console.log("mock deepseek on 4010"));

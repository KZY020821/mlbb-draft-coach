// Local stand-in for the DeepSeek chat API, used only for testing.
import http from "node:http";

let mode = "good";
let calls = 0;
let last = null;
const POOL = ["Hirara", "Marcel", "Aulus", "Khufra", "Melissa", "Eudora", "Barats", "Floryn", "Carmilla", "Argus"];

function goodReply(userText) {
  const unavailable = ((userText.match(/Heroes that are not available: (.*)/) || [])[1] || "").split(", ");
  const need = Number((userText.match(/Recommend exactly (\d)/) || [])[1] || 1);
  let free = POOL.filter((h) => !unavailable.includes(h));
  if (mode === "follow_rules") {
    const m = userText.match(/Counter with: ([^.]+)\./);
    if (m) free = [m[1].split(" or ")[0], ...free];
  }
  return {
    summary: "The enemy has strong dive and your team lacks a frontline.",
    confidence: "medium",
    picks: free.slice(0, need).map((hero) => ({ hero, role: "Roam", why: "Fits the draft.", risk: "May be banned next time." })),
    backups: free.slice(need, need + 2).map((hero) => ({ hero, why: "Reasonable alternative." })),
    plan: "Lock the frontline first."
  };
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
        return reply(JSON.stringify({ summary: "x", picks: [{ hero: "Notahero", why: "x" }], backups: [] }));
      }
      if (mode === "bad_then_good") {
        if (calls === 1) {
          const g = goodReply(userText);
          g.picks[0].hero = "Notahero";
          g.picks.push({ hero: "Hayabusa", role: "Jungle", why: "banned", risk: "x" });
          return reply(JSON.stringify(g));
        }
        return reply(JSON.stringify(goodReply(userText)));
      }
      return reply(JSON.stringify(goodReply(userText)));
    });
  })
  .listen(4010, "127.0.0.1", () => console.log("mock deepseek on 4010"));

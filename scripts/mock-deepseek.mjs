// Local stand-in for the DeepSeek chat API, used only for testing.
import http from "node:http";

let mode = "good";
let calls = 0;
let last = null;

// Reads the candidate lists from the prompt and answers with the first 3 per open position.
function candidateLists(userText) {
  const lists = {};
  let current = null;
  for (const line of userText.split("\n")) {
    const head = line.match(/^(Roam|Marksman|Jungler|Mage|Fighter)\b.*choose \d+ from these candidates only:/);
    if (head) {
      current = head[1];
      lists[current] = [];
      continue;
    }
    const item = line.match(/^- (.+?) \(/);
    if (current && item) lists[current].push(item[1]);
    else if (current && !line.startsWith("- ")) current = null;
  }
  return lists;
}

function goodReply(userText) {
  const lists = candidateLists(userText);
  const open = Object.keys(lists).slice(0, 2);
  const used = new Set();
  const slots = open.map((position) => {
    let heroes = lists[position].filter((h) => !used.has(h));
    if (mode === "ignore_rules_then_good" && calls === 1) {
      const m = userText.match(/Counter with: ([^.]+)\./);
      const counters = m ? m[1].split(" or ") : [];
      heroes = heroes.filter((h) => !counters.includes(h));
    }
    if (mode === "follow_rules") {
      const m = userText.match(/Counter with: ([^.]+)\./);
      const counter = m && m[1].split(" or ").find((h) => heroes.includes(h));
      if (counter) heroes = [counter, ...heroes.filter((h) => h !== counter)];
    }
    const options = heroes.slice(0, 3).map((hero, i) => ({ hero, confidence: i === 0 ? "high" : "medium", why: "Fits the draft.", risk: "May be banned next time." }));
    options.forEach((o) => used.add(o.hero));
    return { position, options };
  });
  return { summary: "The enemy has strong dive and your team lacks a frontline.", slots, plan: "Lock the first slot first." };
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
        return reply(JSON.stringify({ summary: "x", slots: [{ position: "Roam", options: [{ hero: "Notahero", confidence: "high", why: "x" }] }] }));
      }
      if (mode === "bad_then_good" && calls === 1) {
        const g = goodReply(userText);
        g.slots[0].options[0].hero = "Notahero";
        g.slots[0].options[1].hero = "Hayabusa";
        return reply(JSON.stringify(g));
      }
      if (mode === "wrong_position_then_good" && calls === 1) {
        // Barats is only played in EXP by pros, so he is never a candidate for the last open slot in the tests.
        const g = goodReply(userText);
        g.slots[g.slots.length - 1].options[0].hero = "Barats";
        return reply(JSON.stringify(g));
      }
      if (mode === "short_then_good" && calls === 1) {
        const g = goodReply(userText);
        g.slots[0].options = g.slots[0].options.slice(0, 2);
        return reply(JSON.stringify(g));
      }
      return reply(JSON.stringify(goodReply(userText)));
    });
  })
  .listen(4010, "127.0.0.1", () => console.log("mock deepseek on 4010"));

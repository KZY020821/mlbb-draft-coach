// Stand-in for Google's OAuth endpoints, for local tests only.
// POST /__user {email, sub, verified} sets who "signs in" next.
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";

let user = { email: "player@example.com", sub: "sub-player", verified: true, name: "Test Player" };
const codes = new Map(); // code -> { challenge, redirect, user }
const tokens = new Map(); // access token -> user

const b64url = (b) => b.toString("base64url");
const read = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4020");
  if (url.pathname === "/__user" && req.method === "POST") {
    user = { name: "Test Player", verified: true, ...JSON.parse(await read(req)) };
    return res.end("ok");
  }
  if (url.pathname === "/auth") {
    const p = url.searchParams;
    if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge") || !p.get("state")) {
      res.statusCode = 400;
      return res.end("missing pkce or state");
    }
    const code = b64url(randomBytes(12));
    codes.set(code, { challenge: p.get("code_challenge"), redirect: p.get("redirect_uri"), client: p.get("client_id"), user });
    const back = new URL(p.get("redirect_uri"));
    back.searchParams.set("code", code);
    back.searchParams.set("state", p.get("state"));
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    const p = new URLSearchParams(await read(req));
    const entry = codes.get(p.get("code"));
    codes.delete(p.get("code"));
    const ok =
      entry &&
      p.get("client_secret") === "test-google-secret" &&
      p.get("client_id") === entry.client &&
      p.get("redirect_uri") === entry.redirect &&
      b64url(createHash("sha256").update(p.get("code_verifier") ?? "").digest()) === entry.challenge;
    res.setHeader("content-type", "application/json");
    if (!ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: "invalid_grant" })); }
    const token = b64url(randomBytes(16));
    tokens.set(token, entry.user);
    return res.end(JSON.stringify({ access_token: token, token_type: "Bearer", expires_in: 3600 }));
  }
  if (url.pathname === "/userinfo") {
    const u = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    res.setHeader("content-type", "application/json");
    if (!u) { res.statusCode = 401; return res.end("{}"); }
    return res.end(JSON.stringify({ sub: u.sub, email: u.email, email_verified: u.verified, name: u.name, picture: "" }));
  }
  res.statusCode = 404;
  res.end();
}).listen(4020, "127.0.0.1", () => console.log("mock google on 4020"));

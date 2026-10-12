import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { passwordLock } from "../src/auth.js";

async function withServer(password, fn) {
  const app = express();
  app.use(express.json());
  app.use(passwordLock(password));
  app.get("/api/secret", (req, res) => res.json({ ok: true }));
  app.get("/", (req, res) => res.send("home"));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test("without a password everything is open", () =>
  withServer("", async (base) => {
    assert.equal((await fetch(`${base}/api/secret`)).status, 200);
  }));

test("with a password, pages redirect to login and the API refuses", () =>
  withServer("dragons", async (base) => {
    assert.equal((await fetch(`${base}/api/secret`)).status, 401);
    const page = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(page.status, 302);
    assert.match(page.headers.get("location"), /^\/login\.html/);
  }));

test("logging in with the right password unlocks the app", () =>
  withServer("dragons", async (base) => {
    const wrong = await fetch(`${base}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"password":"nope"}' });
    assert.equal(wrong.status, 401);
    const right = await fetch(`${base}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"password":"dragons"}' });
    assert.equal(right.status, 200);
    const cookie = right.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(`${base}/api/secret`, { headers: { cookie } })).status, 200);
  }));

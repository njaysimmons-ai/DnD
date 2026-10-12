// Optional password lock. Set APP_PASSWORD to require it before anyone can see
// or change anything, which you'll want once the app is reachable from the internet.

import crypto from "node:crypto";

const COOKIE = "tc_auth";
const PUBLIC_PATHS = new Set(["/login.html", "/login", "/styles.css", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"]);

function token(password) {
  return crypto.createHmac("sha256", password).update("table-chronicle").digest("hex");
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function passwordLock(password) {
  if (!password) return (req, res, next) => next();
  const expected = token(password);

  return (req, res, next) => {
    if (req.method === "POST" && req.path === "/login") {
      if (same(req.body?.password ?? "", password)) {
        const secure = req.secure ? "; Secure" : "";
        res.setHeader("Set-Cookie", `${COOKIE}=${expected}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`);
        return res.json({ ok: true });
      }
      // Slow down password guessing.
      return setTimeout(() => res.status(401).json({ error: "Wrong password" }), 1000);
    }
    if (same(readCookie(req, COOKIE) ?? "", expected) || PUBLIC_PATHS.has(req.path)) return next();
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Please log in" });
    res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

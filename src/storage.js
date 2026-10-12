// Everything is stored as plain files under data/ so it's easy to back up or inspect.
//
// data/campaign.json              party roster, characters, locations, chapters
// data/sessions/<id>/session.json one recorded game night
// data/sessions/<id>/audio.*      the recording

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const CAMPAIGN_FILE = path.join(DATA_DIR, "campaign.json");

export function emptyCampaign() {
  return {
    name: "Our Campaign",
    // Who sits at the table: [{ player: "Sam", character: "Thorin", isDM: false }]
    roster: [],
    characters: [],
    locations: [],
    chapters: [],
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file first so a crash never leaves half-written JSON behind.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

export async function loadCampaign() {
  return { ...emptyCampaign(), ...(await readJson(CAMPAIGN_FILE, {})) };
}

export async function saveCampaign(campaign) {
  await writeJson(CAMPAIGN_FILE, campaign);
}

export function sessionDir(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Bad session id");
  return path.join(SESSIONS_DIR, id);
}

export async function createSession(title) {
  const date = new Date().toISOString().slice(0, 10);
  const id = `${date}-${crypto.randomBytes(3).toString("hex")}`;
  const session = {
    id,
    title: title || `Session ${date}`,
    createdAt: new Date().toISOString(),
    status: "new",
    audioFile: null,
    utterances: [],
    speakerNames: {},
    chapterId: null,
    error: null,
  };
  await saveSession(session);
  return session;
}

export async function loadSession(id) {
  const session = await readJson(path.join(sessionDir(id), "session.json"), null);
  if (!session) {
    const err = new Error("Session not found");
    err.status = 404;
    throw err;
  }
  return session;
}

export async function saveSession(session) {
  await writeJson(path.join(sessionDir(session.id), "session.json"), session);
}

export async function updateSession(id, changes) {
  const session = await loadSession(id);
  Object.assign(session, changes);
  await saveSession(session);
  return session;
}

export async function listSessions() {
  let ids = [];
  try {
    ids = await fs.readdir(SESSIONS_DIR);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const sessions = [];
  for (const id of ids) {
    const s = await readJson(path.join(SESSIONS_DIR, id, "session.json"), null);
    if (s) sessions.push(s);
  }
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

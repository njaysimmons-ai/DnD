import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DATA_DIR,
  createSession,
  listSessions,
  loadSession,
  saveSession,
  updateSession,
  sessionDir,
  loadCampaign,
  saveCampaign,
} from "./src/storage.js";
import { startTranscription, checkTranscription, parsePastedTranscript } from "./src/transcribe.js";
import { writeChapter, addChapter } from "./src/story.js";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// ---------- Campaign ----------

app.get("/api/campaign", wrap(async (req, res) => {
  res.json(await loadCampaign());
}));

app.put("/api/campaign/settings", wrap(async (req, res) => {
  const campaign = await loadCampaign();
  if (typeof req.body.name === "string") campaign.name = req.body.name.trim() || campaign.name;
  if (Array.isArray(req.body.roster)) {
    campaign.roster = req.body.roster
      .map((r) => ({
        player: String(r.player || "").trim(),
        character: String(r.character || "").trim(),
        isDM: Boolean(r.isDM),
      }))
      .filter((r) => r.player);
  }
  await saveCampaign(campaign);
  res.json(campaign);
}));

// ---------- Sessions ----------

app.get("/api/sessions", wrap(async (req, res) => {
  res.json(await listSessions());
}));

app.post("/api/sessions", wrap(async (req, res) => {
  res.json(await createSession(req.body.title));
}));

app.get("/api/sessions/:id", wrap(async (req, res) => {
  res.json(await loadSession(req.params.id));
}));

app.patch("/api/sessions/:id", wrap(async (req, res) => {
  const changes = {};
  if (typeof req.body.title === "string") changes.title = req.body.title;
  if (req.body.speakerNames && typeof req.body.speakerNames === "object") {
    changes.speakerNames = req.body.speakerNames;
  }
  res.json(await updateSession(req.params.id, changes));
}));

app.delete("/api/sessions/:id", wrap(async (req, res) => {
  await loadSession(req.params.id);
  await fs.rm(sessionDir(req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

// Live recording: the browser sends a small piece of audio every few seconds and we
// append it, so a dead battery or closed tab only loses the last few seconds.
app.post(
  "/api/sessions/:id/chunks",
  express.raw({ type: "*/*", limit: "50mb" }),
  wrap(async (req, res) => {
    const session = await loadSession(req.params.id);
    const ext = req.query.ext === "mp4" ? "mp4" : req.query.ext === "ogg" ? "ogg" : "webm";
    const file = `audio.${ext}`;
    if (session.audioFile && session.audioFile !== file) {
      return res.status(409).json({ error: "This session already has a different recording." });
    }
    await fs.appendFile(path.join(sessionDir(session.id), file), req.body);
    if (!session.audioFile || session.status !== "recording") {
      await updateSession(session.id, { audioFile: file, status: "recording" });
    }
    res.json({ ok: true });
  }),
);

app.post("/api/sessions/:id/finish-recording", wrap(async (req, res) => {
  res.json(await updateSession(req.params.id, { status: "recorded" }));
}));

// Upload a finished recording (e.g. a phone voice memo).
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, sessionDir(req.params.id)),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".audio").toLowerCase().replace(/[^.a-z0-9]/g, "");
      cb(null, `upload${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 ** 3 },
});

app.post(
  "/api/sessions/:id/audio",
  wrap(async (req, res) => {
    await loadSession(req.params.id);
    await new Promise((resolve, reject) =>
      upload.single("audio")(req, res, (err) => (err ? reject(err) : resolve())),
    );
    if (!req.file) return res.status(400).json({ error: "No audio file received." });
    res.json(await updateSession(req.params.id, { audioFile: req.file.filename, status: "recorded" }));
  }),
);

app.get("/api/sessions/:id/audio", wrap(async (req, res) => {
  const session = await loadSession(req.params.id);
  if (!session.audioFile) return res.status(404).end();
  res.sendFile(path.join(sessionDir(session.id), session.audioFile));
}));

app.post("/api/sessions/:id/transcribe", wrap(async (req, res) => {
  const session = await loadSession(req.params.id);
  if (!session.audioFile) return res.status(400).json({ error: "Record or upload audio first." });

  const campaign = await loadCampaign();
  const hints = [
    ...campaign.roster.flatMap((r) => [r.player, r.character]),
    ...campaign.characters.map((c) => c.name),
    ...campaign.locations.map((l) => l.name),
  ];
  const jobId = await startTranscription(path.join(sessionDir(session.id), session.audioFile), {
    speakersExpected: campaign.roster.length || undefined,
    hints,
  });
  const updated = await updateSession(session.id, {
    status: "transcribing",
    transcriptionJob: jobId,
    error: null,
  });
  pollTranscription(session.id);
  res.json(updated);
}));

app.post("/api/sessions/:id/transcript", wrap(async (req, res) => {
  const utterances = parsePastedTranscript(String(req.body.text || ""));
  if (!utterances.length) return res.status(400).json({ error: "That transcript looks empty." });
  const speakerNames = Object.fromEntries(utterances.map((u) => [u.speaker, u.speaker]));
  res.json(await updateSession(req.params.id, {
    utterances,
    speakerNames,
    status: "transcribed",
    error: null,
  }));
}));

app.post("/api/sessions/:id/chapter", wrap(async (req, res) => {
  const session = await loadSession(req.params.id);
  if (!session.utterances.length) return res.status(400).json({ error: "Transcribe the session first." });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return res.status(400).json({ error: "Add your ANTHROPIC_API_KEY to the .env file, then restart the app." });
  }
  const updated = await updateSession(session.id, { status: "writing", error: null });
  generateChapter(session.id);
  res.json(updated);
}));

// ---------- Background jobs ----------

function pollTranscription(id, delay = 15000) {
  setTimeout(async () => {
    try {
      const session = await loadSession(id);
      if (session.status !== "transcribing") return;
      const result = await checkTranscription(session.transcriptionJob);
      if (result.status !== "completed") return pollTranscription(id, delay);

      // Voices come back as "A", "B"... The user matches them to people in the app.
      const speakerNames = {};
      for (const u of result.utterances) speakerNames[u.speaker] ??= `Speaker ${u.speaker}`;
      await updateSession(id, { utterances: result.utterances, speakerNames, status: "transcribed" });
    } catch (err) {
      console.error(`Transcription for ${id} failed:`, err);
      await updateSession(id, { status: "error", error: err.message }).catch(() => {});
    }
  }, delay);
}

let chapterQueue = Promise.resolve();

function generateChapter(id) {
  // One chapter at a time, so two chapters never update the campaign file at once.
  chapterQueue = chapterQueue.then(async () => {
    try {
      const session = await loadSession(id);
      const chapter = await writeChapter({ campaign: await loadCampaign(), session });
      const campaign = await loadCampaign();
      const stored = addChapter(campaign, chapter, session);
      await saveCampaign(campaign);
      await updateSession(id, { status: "done", chapterId: stored.id });
    } catch (err) {
      console.error(`Writing the chapter for ${id} failed:`, err);
      await updateSession(id, { status: "error", error: err.message }).catch(() => {});
    }
  });
}

// Resume work that was in progress when the server stopped.
for (const s of await listSessions()) {
  if (s.status === "transcribing" && s.transcriptionJob) pollTranscription(s.id, 1000);
  if (s.status === "writing") generateChapter(s.id);
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Table Chronicle is running at http://localhost:${port}`);
  console.log(`Data is stored in ${DATA_DIR}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("Note: ANTHROPIC_API_KEY is not set yet (see .env.example).");
});

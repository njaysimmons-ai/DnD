// Speech-to-text with "who said what" labels (speaker diarization) via AssemblyAI.
// Claude doesn't take audio, so this step turns the recording into text first.
//
// AssemblyAI labels voices "A", "B", "C"... The app then lets you tell it which
// letter is the DM, which is Sam, and so on.

import fs from "node:fs";

const API = "https://api.assemblyai.com/v2";

function apiKey() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Add it to .env, or paste a transcript instead.",
    );
  }
  return key;
}

async function call(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { authorization: apiKey(), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`AssemblyAI ${res.status}: ${body.error || res.statusText}`);
  }
  return body;
}

/**
 * Uploads the audio and starts a transcription job. Returns the job id.
 * `hints` are names (characters, places) that help the recogniser spell fantasy words.
 */
export async function startTranscription(audioPath, { speakersExpected, hints = [] } = {}) {
  const audio = await fs.openAsBlob(audioPath);
  const { upload_url } = await call("/upload", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: audio,
  });

  const request = { audio_url: upload_url, speaker_labels: true };
  if (speakersExpected) request.speakers_expected = speakersExpected;
  const words = [...new Set(hints.map((h) => h.trim()).filter(Boolean))].slice(0, 100);
  if (words.length) request.word_boost = words;

  const job = await call("/transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return job.id;
}

/**
 * Returns { status: "processing" } until done, then
 * { status: "completed", utterances: [{ speaker, text, start }] }.
 */
export async function checkTranscription(jobId) {
  const job = await call(`/transcript/${jobId}`);
  if (job.status === "error") throw new Error(`Transcription failed: ${job.error}`);
  if (job.status !== "completed") return { status: "processing" };
  const utterances = (job.utterances || []).map((u) => ({
    speaker: u.speaker,
    text: u.text,
    start: u.start,
  }));
  return { status: "completed", utterances };
}

/**
 * Parses a pasted transcript. Accepts lines like
 *   "DM: You enter the crypt."
 *   "[00:12:03] Sam: I check for traps."
 * Lines without a "Name:" prefix are added to the previous speaker's line.
 */
export function parsePastedTranscript(text) {
  const utterances = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:\[?\(?(\d{1,2}:)?\d{1,2}:\d{2}\)?\]?\s*)?([^:]{1,40}):\s*(.+)$/);
    if (m) {
      utterances.push({ speaker: m[2].trim(), text: m[3].trim(), start: null });
    } else if (utterances.length) {
      utterances[utterances.length - 1].text += ` ${line}`;
    } else {
      utterances.push({ speaker: "Unknown", text: line, start: null });
    }
  }
  return utterances;
}

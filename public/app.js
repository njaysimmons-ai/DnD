import { portraitSVG } from "./art.js";

const $ = (sel, root = document) => root.querySelector(sel);

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)
      ? { "content-type": "application/json", ...options.headers }
      : options.headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Tabs ----------

function showTab(name) {
  try { localStorage.setItem("tab", name); } catch {}
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  if (name === "sessions") refreshSessions();
  if (name === "party") loadParty();
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- Recorder ----------

const recorder = {
  media: null,
  stream: null,
  session: null,
  queue: [],
  uploading: false,
  startedAt: 0,
  timer: null,
  wakeLock: null,
  audioCtx: null,
};

function pickMimeType() {
  const options = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "mp4"],
    ["audio/ogg;codecs=opus", "ogg"],
  ];
  return options.find(([type]) => MediaRecorder.isTypeSupported?.(type)) || ["", "webm"];
}

async function uploadQueue() {
  if (recorder.uploading) return;
  recorder.uploading = true;
  try {
    while (recorder.queue.length) {
      const { blob, ext } = recorder.queue[0];
      try {
        await api(`/api/sessions/${recorder.session.id}/chunks?ext=${ext}`, { method: "POST", body: blob });
        recorder.queue.shift();
      } catch (err) {
        // Keep the piece and try again shortly (e.g. Wi-Fi blipped).
        setRecStatus(`Saving is retrying: ${err.message}`, true);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } finally {
    recorder.uploading = false;
  }
}

function setRecStatus(text, isError = false) {
  const el = $("#rec-status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function drawMeter(analyser) {
  const canvas = $("#rec-meter");
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(analyser.fftSize);
  const tick = () => {
    if (!recorder.media) return ctx.clearRect(0, 0, canvas.width, canvas.height);
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = peak > 0.9 ? "#e5484d" : "#c9a227";
    ctx.fillRect(0, 10, canvas.width * Math.min(1, peak * 1.5), 20);
    requestAnimationFrame(tick);
  };
  tick();
}

async function startRecording() {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    setRecStatus(
      "This browser blocks the microphone on this address. Open the app at http://localhost on the computer running it, use an https link, or upload a voice memo from Sessions.",
      true,
    );
    return;
  }
  try {
    recorder.stream = await navigator.mediaDevices.getUserMedia({
      // Room recording: keep quiet voices across the table instead of filtering them out.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
  } catch (err) {
    setRecStatus(`Couldn't use the microphone: ${err.message}`, true);
    return;
  }

  recorder.session = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title: $("#rec-title").value.trim() }),
  });

  const [mimeType, ext] = pickMimeType();
  recorder.media = new MediaRecorder(recorder.stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 48000 });
  recorder.media.ondataavailable = (e) => {
    if (e.data.size) {
      recorder.queue.push({ blob: e.data, ext });
      uploadQueue();
    }
  };
  recorder.media.start(5000); // hand us a piece every 5 seconds

  recorder.audioCtx = new AudioContext();
  const analyser = recorder.audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  recorder.audioCtx.createMediaStreamSource(recorder.stream).connect(analyser);
  drawMeter(analyser);

  try {
    recorder.wakeLock = await navigator.wakeLock?.request("screen");
  } catch { /* not supported: the tip asks people to keep the screen on */ }

  recorder.startedAt = Date.now();
  recorder.timer = setInterval(() => {
    const s = Math.floor((Date.now() - recorder.startedAt) / 1000);
    $("#rec-time").textContent = [s / 3600, (s % 3600) / 60, s % 60]
      .map((n) => String(Math.floor(n)).padStart(2, "0"))
      .join(":");
  }, 500);

  $("#rec-button").classList.add("recording");
  $("#rec-button").textContent = "■";
  $("#rec-button").setAttribute("aria-label", "Stop recording");
  setRecStatus("Recording… tap ■ when the session ends.");
}

async function stopRecording() {
  const stopped = new Promise((r) => (recorder.media.onstop = r));
  recorder.media.stop();
  await stopped;
  recorder.stream.getTracks().forEach((t) => t.stop());
  recorder.media = null;
  clearInterval(recorder.timer);
  recorder.audioCtx?.close();
  recorder.wakeLock?.release().catch(() => {});
  recorder.wakeLock = null;

  $("#rec-button").classList.remove("recording");
  $("#rec-button").textContent = "●";
  $("#rec-button").setAttribute("aria-label", "Start recording");
  setRecStatus("Saving the last bit…");
  while (recorder.queue.length || recorder.uploading) {
    await uploadQueue();
    await new Promise((r) => setTimeout(r, 200));
  }
  await api(`/api/sessions/${recorder.session.id}/finish-recording`, { method: "POST" });
  setRecStatus("Saved! Head to Sessions to transcribe it.");
  $("#rec-title").value = "";
  showTab("sessions");
}

$("#rec-button").addEventListener("click", () => (recorder.media ? stopRecording() : startRecording()));

// Re-acquire the screen wake lock when coming back to the tab.
document.addEventListener("visibilitychange", async () => {
  if (recorder.media && document.visibilityState === "visible") {
    try { recorder.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  }
});

window.addEventListener("beforeunload", (e) => {
  if (recorder.media) e.preventDefault();
});

// ---------- Sessions ----------

const STATUS_LABELS = {
  new: "No audio yet",
  recording: "Recording",
  recorded: "Ready to transcribe",
  transcribing: "Transcribing…",
  transcribed: "Ready to write",
  writing: "Claude is writing…",
  done: "Chapter ready",
  error: "Something went wrong",
};

let pollTimer = null;
let roster = [];

async function refreshSessions() {
  const [sessions, campaign] = await Promise.all([api("/api/sessions"), api("/api/campaign")]);
  roster = campaign.roster;
  const list = $("#session-list");
  // Don't redraw while someone is typing a speaker name.
  if (list.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  list.replaceChildren(...sessions.map(renderSession));
  if (!sessions.length) list.innerHTML = `<p class="muted">No sessions yet. Record one, or add a file or transcript.</p>`;

  clearTimeout(pollTimer);
  const busy = sessions.some((s) => ["transcribing", "writing"].includes(s.status) || (s.status === "recording" && s.id !== recorder.session?.id));
  if (busy) pollTimer = setTimeout(refreshSessions, 5000);
}

function button(label, onClick, cls = "") {
  const b = document.createElement("button");
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await onClick();
    } catch (err) {
      alert(err.message);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

async function uploadAudio(session, statusEl) {
  const file = await pickFile("audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.aac");
  if (!file) return;
  const form = new FormData();
  form.append("audio", file);
  // XHR instead of fetch so we can show upload progress for big files.
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/sessions/${session.id}/audio`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) statusEl.textContent = `Uploading ${Math.round((e.loaded / e.total) * 100)}%`;
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || "{}").error || "Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
  await refreshSessions();
}

async function pasteTranscript(session) {
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `
    <form method="dialog" class="paste-dialog">
      <h3>Paste a transcript</h3>
      <p class="muted">One line per speaker, like <code>DM: You enter the crypt.</code> or <code>Sam: I check for traps.</code></p>
      <textarea rows="14" required></textarea>
      <div class="row"><button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">Save</button></div>
    </form>`;
  document.body.append(dialog);
  dialog.showModal();
  await new Promise((r) => dialog.addEventListener("close", r, { once: true }));
  const text = $("textarea", dialog).value;
  dialog.remove();
  if (dialog.returnValue !== "ok") return;
  await api(`/api/sessions/${session.id}/transcript`, { method: "POST", body: JSON.stringify({ text }) });
  await refreshSessions();
}

function rosterLabel(r) {
  if (r.isDM) return `${r.player} (DM)`;
  return r.character ? `${r.player} (${r.character})` : r.player;
}

function renderSpeakers(session, container) {
  const speakers = Object.keys(session.speakerNames);
  if (!speakers.length) return;
  const samples = {};
  for (const u of session.utterances) (samples[u.speaker] ||= []).push(u.text);

  container.innerHTML = `<h4>Who's who?</h4><p class="muted">Match each voice to a person. Sample lines help you tell them apart.</p>`;
  const datalistId = `roster-${session.id}`;
  const datalist = document.createElement("datalist");
  datalist.id = datalistId;
  datalist.innerHTML = roster.map((r) => `<option value="${escapeHtml(r.isDM ? "DM" : r.player)}">${escapeHtml(rosterLabel(r))}</option>`).join("");
  container.append(datalist);

  for (const sp of speakers) {
    const lines = (samples[sp] || []).slice().sort((a, b) => b.length - a.length).slice(0, 2);
    const row = document.createElement("div");
    row.className = "speaker-row";
    row.innerHTML = `
      <input list="${datalistId}" value="${escapeHtml(session.speakerNames[sp])}" aria-label="Name for speaker ${escapeHtml(sp)}">
      <span class="muted">${(samples[sp] || []).length} lines · “${escapeHtml(lines[0]?.slice(0, 120) || "")}”</span>`;
    $("input", row).addEventListener("change", async (e) => {
      session.speakerNames[sp] = e.target.value.trim() || `Speaker ${sp}`;
      await api(`/api/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ speakerNames: session.speakerNames }) });
      renderTranscript(session, e.target.closest(".session"));
    });
    container.append(row);
  }
}

function renderTranscript(session, card) {
  const box = $(".transcript-lines", card);
  box.innerHTML = session.utterances
    .slice(0, 2000)
    .map((u) => `<p><b>${escapeHtml(session.speakerNames[u.speaker] || u.speaker)}:</b> ${escapeHtml(u.text)}</p>`)
    .join("");
  if (session.utterances.length > 2000) box.innerHTML += `<p class="muted">…and ${session.utterances.length - 2000} more lines</p>`;
}

function renderSession(session) {
  const card = $("#session-template").content.firstElementChild.cloneNode(true);
  $(".s-title", card).textContent = session.title;
  $(".s-date", card).textContent = new Date(session.createdAt).toLocaleDateString();
  const status = $(".s-status", card);
  status.textContent = STATUS_LABELS[session.status] || session.status;
  status.dataset.status = session.status;
  $(".s-error", card).textContent = session.error || "";

  const audio = $(".s-audio", card);
  if (session.audioFile && session.status !== "recording") audio.src = `/api/sessions/${session.id}/audio`;
  else audio.remove();

  const actions = $(".s-actions", card);
  const hasAudio = Boolean(session.audioFile);
  const hasText = session.utterances.length > 0;
  const busy = ["transcribing", "writing"].includes(session.status);

  if (session.status === "recording" && session.id !== recorder.session?.id) {
    actions.append(button("Mark recording as finished", async () => {
      await api(`/api/sessions/${session.id}/finish-recording`, { method: "POST" });
      await refreshSessions();
    }));
  }
  if (session.chapterId) {
    const a = document.createElement("a");
    a.href = `play.html?chapter=${encodeURIComponent(session.chapterId)}`;
    a.className = "button primary";
    a.textContent = "▶ Play chapter";
    actions.append(a);
  }
  if (!busy && hasText) {
    actions.append(button(session.chapterId ? "Rewrite chapter" : "✨ Write the chapter", async () => {
      await api(`/api/sessions/${session.id}/chapter`, { method: "POST" });
      await refreshSessions();
    }, session.chapterId ? "" : "primary"));
  }
  if (!busy && hasAudio && session.status !== "recording") {
    actions.append(button(hasText ? "Transcribe again" : "Transcribe", async () => {
      await api(`/api/sessions/${session.id}/transcribe`, { method: "POST" });
      await refreshSessions();
    }, hasText ? "" : "primary"));
  }
  if (!busy && !hasAudio) actions.append(button("Upload audio", () => uploadAudio(session, status)));
  if (!busy) actions.append(button(hasText ? "Replace transcript" : "Paste transcript", () => pasteTranscript(session)));
  actions.append(button("Delete", async () => {
    if (!confirm(`Delete "${session.title}"? The recording and transcript will be gone.`)) return;
    await api(`/api/sessions/${session.id}`, { method: "DELETE" });
    await refreshSessions();
  }, "danger"));

  if (busy) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = session.status === "transcribing"
      ? "Transcribing usually takes a few minutes per hour of audio. You can close this page."
      : "Claude is reading the whole session and writing the chapter. This takes a few minutes; you can close this page.";
    actions.append(note);
  }

  if (hasText) {
    renderSpeakers(session, $(".s-speakers", card));
    renderTranscript(session, card);
  } else {
    $(".s-transcript", card).remove();
  }
  return card;
}

$("#new-session").addEventListener("click", async () => {
  const title = prompt("Session name?", "");
  if (title === null) return;
  await api("/api/sessions", { method: "POST", body: JSON.stringify({ title }) });
  await refreshSessions();
});

// ---------- Party ----------

function rosterRow(r = { player: "", character: "", isDM: false }) {
  const row = document.createElement("div");
  row.className = "roster-row";
  row.innerHTML = `
    <input class="r-player" placeholder="Person" value="${escapeHtml(r.player)}">
    <input class="r-character" placeholder="Character" value="${escapeHtml(r.character)}">
    <label class="inline"><input type="checkbox" class="r-dm" ${r.isDM ? "checked" : ""}> DM</label>
    <button class="r-remove" aria-label="Remove">✕</button>`;
  $(".r-dm", row).addEventListener("change", (e) => ($(".r-character", row).disabled = e.target.checked));
  $(".r-character", row).disabled = r.isDM;
  $(".r-remove", row).addEventListener("click", () => row.remove());
  return row;
}

async function loadParty() {
  const campaign = await api("/api/campaign");
  $("#campaign-name").value = campaign.name;
  const rows = campaign.roster.length ? campaign.roster : [{ player: "", character: "", isDM: true }];
  $("#roster").replaceChildren(...rows.map(rosterRow));
  const chars = $("#character-list");
  chars.innerHTML = campaign.characters.length
    ? campaign.characters
        .map((c) => `
          <div class="character-card">
            <div class="mini-portrait">${portraitSVG(c)}</div>
            <div><b>${escapeHtml(c.name)}</b> <span class="muted">${c.kind === "pc" ? `played by ${escapeHtml(c.player)}` : c.kind}</span>
            <p>${escapeHtml(c.description)}</p></div>
          </div>`)
        .join("")
    : `<p class="muted">Characters appear here after Claude writes your first chapter.</p>`;
}

$("#add-player").addEventListener("click", () => $("#roster").append(rosterRow()));
$("#save-party").addEventListener("click", async () => {
  const rosterData = [...document.querySelectorAll(".roster-row")].map((row) => ({
    player: $(".r-player", row).value,
    character: $(".r-dm", row).checked ? "" : $(".r-character", row).value,
    isDM: $(".r-dm", row).checked,
  }));
  await api("/api/campaign/settings", {
    method: "PUT",
    body: JSON.stringify({ name: $("#campaign-name").value, roster: rosterData }),
  });
  $("#save-party").textContent = "Saved ✓";
  setTimeout(() => ($("#save-party").textContent = "Save"), 1500);
});

// Open the tab from the link (#sessions) or the one used last time on this device.
{
  let saved = null;
  try { saved = localStorage.getItem("tab"); } catch {}
  const wanted = location.hash.slice(1) || saved;
  if (["record", "sessions", "party"].includes(wanted)) showTab(wanted);
}

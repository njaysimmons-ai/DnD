import { sceneSVG, portraitSVG } from "./art.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const state = {
  campaign: null,
  chapter: null,
  steps: [],
  index: 0,
  pending: [], // extra lines queued after a choice ("what if…")
  typing: null,
  auto: false,
  autoTimer: null,
  scene: null,
};

// ---------- Loading ----------

async function loadCampaign() {
  if (params.has("demo")) return fetchJson("demo/campaign.json");
  try {
    const campaign = await fetchJson("/api/campaign");
    if (campaign.chapters.length) return campaign;
  } catch { /* opened without the server: show the demo */ }
  const demo = await fetchJson("demo/campaign.json");
  demo.isDemo = true;
  return demo;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function character(id) {
  return state.campaign.characters.find((c) => c.id === id) || null;
}

function location_(id) {
  return state.campaign.locations.find((l) => l.id === id) || { id, name: "", setting: "road" };
}

// ---------- Menu ----------

function showMenu() {
  stopAuto();
  $("stage").classList.add("hidden");
  $("menu").classList.remove("hidden");
  $("campaign-title").textContent = state.campaign.name;
  const list = $("chapters");
  list.replaceChildren();
  if (state.campaign.isDemo) {
    const note = document.createElement("p");
    note.className = "demo-note";
    note.textContent = "No chapters yet, so here's a demo chapter. Record a session and let Claude write your first one!";
    list.append(note);
  }
  for (const chapter of state.campaign.chapters) {
    const firstScene = chapter.scenes[0];
    const loc = firstScene ? location_(firstScene.location_id) : null;
    const card = document.createElement("button");
    card.className = "chapter-card";
    card.innerHTML = `
      <div class="chapter-art">${loc ? sceneSVG({ setting: loc.setting, time: firstScene.time_of_day, seed: loc.id }) : ""}</div>
      <div class="chapter-text">
        <div class="chapter-number">Chapter ${chapter.number}${chapter.date ? ` · ${chapter.date}` : ""}</div>
        <div class="chapter-title"></div>
        <p class="chapter-recap"></p>
      </div>`;
    card.querySelector(".chapter-title").textContent = chapter.title;
    card.querySelector(".chapter-recap").textContent = chapter.recap;
    card.addEventListener("click", () => startChapter(chapter));
    list.append(card);
  }
}

// ---------- Story playback ----------

function buildSteps(chapter) {
  const steps = [];
  chapter.scenes.forEach((scene, sceneIndex) => {
    steps.push({ type: "scene", scene, sceneIndex });
    for (const beat of scene.beats) steps.push({ type: "beat", scene, beat });
    if (scene.choice?.options?.length) steps.push({ type: "choice", scene, choice: scene.choice });
  });
  steps.push({ type: "end" });
  return steps;
}

function startChapter(chapter) {
  state.chapter = chapter;
  state.steps = buildSteps(chapter);
  state.index = 0;
  state.pending = [];
  state.scene = null;
  $("menu").classList.add("hidden");
  $("ending").classList.add("hidden");
  $("stage").classList.remove("hidden");
  $("hud-chapter").textContent = `Chapter ${chapter.number}: ${chapter.title}`;
  history.replaceState(null, "", `?${params.has("demo") ? "demo&" : ""}chapter=${encodeURIComponent(chapter.id)}`);
  runStep();
}

function runStep() {
  clearTimeout(state.autoTimer);
  const step = state.steps[state.index];
  $("progress-bar").style.width = `${(state.index / (state.steps.length - 1)) * 100}%`;
  $("choices").classList.add("hidden");

  if (step.type === "scene") return showScene(step.scene, step.sceneIndex);
  if (step.type === "beat") return showBeat(step.beat, step.scene);
  if (step.type === "choice") return showChoice(step.choice);
  if (step.type === "end") return showEnding();
}

function advance() {
  if (state.typing) return finishTyping();
  const step = state.steps[state.index];
  if (step?.type === "choice" && !step.picked) return; // must pick first
  if (step?.type === "end") return;
  if (state.pending.length) return showLine(state.pending.shift());
  state.index = Math.min(state.index + 1, state.steps.length - 1);
  runStep();
}

function goBack() {
  if (state.typing) finishTyping();
  state.pending = [];
  // Step back over beats; landing on a scene card replays it, so go one further.
  let i = state.index - 1;
  while (i > 0 && state.steps[i].type === "scene") i--;
  if (i < 0) return;
  state.index = i;
  const step = state.steps[i];
  if (step.scene && step.scene !== state.scene) setScenery(step.scene, true);
  if (step.type === "choice") step.picked = false;
  runStep();
}

// ---------- Scenery ----------

function setScenery(scene, instant = false) {
  state.scene = scene;
  const loc = location_(scene.location_id);
  const next = $("backdrop-next");
  next.innerHTML = sceneSVG({ setting: loc.setting, time: scene.time_of_day, seed: loc.id });
  next.classList.add("visible");
  const swap = () => {
    $("backdrop").innerHTML = next.innerHTML;
    next.classList.remove("visible");
    next.innerHTML = "";
  };
  if (instant) swap();
  else setTimeout(swap, 900);

  $("mood").dataset.mood = scene.mood;
  setWeather(scene.weather);
  $("hud-scene").textContent = loc.name ? ` — ${loc.name}` : "";
  renderCast(scene.characters_present, null);
}

function showScene(scene) {
  setScenery(scene);
  const loc = location_(scene.location_id);
  $("scene-card-location").textContent = loc.name;
  $("scene-card-title").textContent = scene.title;
  const card = $("scene-card");
  card.classList.remove("hidden");
  card.classList.remove("show");
  void card.offsetWidth; // restart the animation
  card.classList.add("show");
  $("nameplate").classList.add("hidden");
  $("line").textContent = "";
  $("line").className = "line";
  // Show the scene card briefly, then go straight into the first line.
  state.autoTimer = setTimeout(() => {
    card.classList.add("hidden");
    if (state.steps[state.index]?.scene === scene && state.steps[state.index].type === "scene") advance();
  }, 2200);
}

function renderCast(ids = [], speakerId) {
  const cast = $("cast");
  const present = [...new Set(ids)].filter((id) => character(id));
  if (speakerId && character(speakerId) && !present.includes(speakerId)) present.push(speakerId);
  const shown = present.slice(0, 5);
  if (speakerId && !shown.includes(speakerId) && character(speakerId)) shown[shown.length - 1] = speakerId;

  const existing = new Map([...cast.children].map((el) => [el.dataset.id, el]));
  cast.replaceChildren(
    ...shown.map((id) => {
      let el = existing.get(id);
      if (!el) {
        el = document.createElement("div");
        el.className = "actor enter";
        el.dataset.id = id;
        el.innerHTML = portraitSVG(character(id));
        setTimeout(() => el.classList.remove("enter"), 20);
      }
      el.classList.toggle("speaking", id === speakerId);
      el.classList.toggle("dim", Boolean(speakerId) && id !== speakerId);
      return el;
    }),
  );
  cast.dataset.count = shown.length;
}

// ---------- Lines ----------

function showBeat(beat, scene) {
  if (scene !== state.scene) setScenery(scene, true);
  $("scene-card").classList.add("hidden");
  showLine({
    kind: beat.kind,
    speaker: beat.speaker_id ? character(beat.speaker_id) : null,
    text: beat.text,
  });
}

function showLine({ kind, speaker, text, label }) {
  const plate = $("nameplate");
  const line = $("line");
  line.className = `line kind-${kind}`;
  renderCast(state.scene?.characters_present, kind === "narration" ? null : speaker?.id);

  if (label || (speaker && kind === "dialogue")) {
    plate.textContent = label || speaker.name;
    plate.style.setProperty("--accent", speaker?.color || "#c9a227");
    plate.classList.remove("hidden");
  } else {
    plate.classList.add("hidden");
  }

  const shown = kind === "dialogue" ? `“${text}”` : text;
  typeText(line, shown);
}

function typeText(el, text) {
  finishTyping(false);
  el.textContent = "";
  let i = 0;
  state.typing = {
    text,
    el,
    timer: setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) finishTyping();
    }, 22),
  };
}

function finishTyping(scheduleAuto = true) {
  if (!state.typing) return;
  clearInterval(state.typing.timer);
  state.typing.el.textContent = state.typing.text;
  const length = state.typing.text.length;
  state.typing = null;
  if (scheduleAuto && state.auto) {
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => {
      const step = state.steps[state.index];
      if (step?.type !== "choice" || step.picked) advance();
    }, 1400 + length * 35);
  }
}

// ---------- Choices ----------

function showChoice(choice) {
  const step = state.steps[state.index];
  step.picked = false;
  $("nameplate").classList.add("hidden");
  renderCast(state.scene?.characters_present, null);
  typeText($("line"), choice.prompt);
  $("line").className = "line kind-prompt";
  const box = $("choices");
  box.replaceChildren(
    ...choice.options.map((option) => {
      const b = document.createElement("button");
      b.textContent = option.text;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        pick(choice, option);
      });
      return b;
    }),
  );
  box.classList.remove("hidden");
  stopAuto();
}

function pick(choice, option) {
  const step = state.steps[state.index];
  step.picked = true;
  const canon = choice.options.find((o) => o.chosen) || option;
  [...$("choices").children].forEach((b, i) => {
    b.disabled = true;
    if (choice.options[i] === canon) b.classList.add("canon");
    if (choice.options[i] === option) b.classList.add("picked");
  });
  if (option === canon) {
    showLine({ kind: "narration", text: canon.outcome });
  } else {
    showLine({ kind: "narration", text: option.outcome, label: "What if…" });
    $("line").classList.add("kind-whatif");
    state.pending.push({
      kind: "narration",
      label: "What really happened",
      text: `The party chose: ${canon.text}. ${canon.outcome}`,
    });
  }
  setTimeout(() => $("choices").classList.add("hidden"), 1200);
}

// ---------- Ending ----------

function showEnding() {
  stopAuto();
  const ch = state.chapter;
  $("ending-title").textContent = `End of Chapter ${ch.number}: ${ch.title}`;
  $("ending-recap").textContent = ch.recap;
  const fill = (id, items, empty) => {
    $(id).replaceChildren(
      ...(items.length ? items : [empty]).map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
  };
  fill("ending-loot", ch.loot || [], "Nothing this time.");
  fill("ending-threads", ch.plot_threads || [], "All quiet… for now.");
  const chapters = state.campaign.chapters;
  const next = chapters[chapters.indexOf(ch) + 1];
  $("next-chapter-button").classList.toggle("hidden", !next);
  $("next-chapter-button").onclick = () => next && startChapter(next);
  $("ending").classList.remove("hidden");
  $("progress-bar").style.width = "100%";
}

// ---------- Weather ----------

const weather = { kind: "clear", particles: [], raf: null, lightning: 0 };

function setWeather(kind) {
  if (weather.kind === kind && weather.raf) return;
  weather.kind = kind;
  const canvas = $("weather");
  const ctx = canvas.getContext("2d");
  const resize = () => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  };
  resize();
  window.onresize = resize;
  document.body.dataset.weather = kind;

  const count = { rain: 220, storm: 320, snow: 160, embers: 70, fog: 0, clear: 0 }[kind] ?? 0;
  const make = () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    v: kind === "snow" ? 0.6 + Math.random() * 1.2 : kind === "embers" ? -(0.5 + Math.random()) : 12 + Math.random() * 8,
    s: Math.random(),
  });
  weather.particles = Array.from({ length: count }, make);
  cancelAnimationFrame(weather.raf);

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = devicePixelRatio;
    for (const p of weather.particles) {
      if (kind === "rain" || kind === "storm") {
        ctx.strokeStyle = "rgba(180,200,230,0.45)";
        ctx.lineWidth = k;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 3 * k, p.y + 16 * k);
        ctx.stroke();
        p.y += p.v * k;
        p.x -= 1.5 * k;
      } else if (kind === "snow") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 + p.s * 2.5) * k, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.v * k;
        p.x += Math.sin((p.y / 40) + p.s * 6) * 0.6 * k;
      } else if (kind === "embers") {
        ctx.fillStyle = `rgba(255,${120 + p.s * 100},40,${0.5 + p.s * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 + p.s * 2) * k, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.v * k;
        p.x += Math.sin(p.y / 30 + p.s * 10) * 0.8 * k;
      }
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      if (p.y < -20) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
    }
    if (kind === "storm" && Math.random() < 0.004) {
      $("flash").classList.remove("on");
      void $("flash").offsetWidth;
      $("flash").classList.add("on");
    }
    weather.raf = requestAnimationFrame(draw);
  };
  if (count || kind === "storm") draw();
}

// ---------- Controls ----------

function stopAuto() {
  state.auto = false;
  clearTimeout(state.autoTimer);
  $("auto-button").classList.remove("on");
  $("auto-button").textContent = "▶ Auto";
}

$("auto-button").addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.auto) return stopAuto();
  state.auto = true;
  $("auto-button").classList.add("on");
  $("auto-button").textContent = "❚❚ Auto";
  if (!state.typing) advance();
});

$("menu-button").addEventListener("click", (e) => {
  e.stopPropagation();
  showMenu();
});

$("stage").addEventListener("click", (e) => {
  if (e.target.closest("button, .ending")) return;
  if (state.auto) stopAuto();
  advance();
});

document.addEventListener("keydown", (e) => {
  if ($("stage").classList.contains("hidden")) return;
  if (["Space", "Enter", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
    advance();
  } else if (e.code === "ArrowLeft") {
    goBack();
  } else if (e.code === "Escape") {
    showMenu();
  } else if (/^Digit[1-9]$/.test(e.code)) {
    const buttons = $("choices").querySelectorAll("button:not(:disabled)");
    buttons[Number(e.code.slice(5)) - 1]?.click();
  }
});

$("replay-button").addEventListener("click", () => startChapter(state.chapter));
$("ending-menu-button").addEventListener("click", showMenu);

// ---------- Start ----------

state.campaign = await loadCampaign();
document.title = `${state.campaign.name} — Table Chronicle`;
const requested = state.campaign.chapters.find((c) => c.id === params.get("chapter"));
if (requested) startChapter(requested);
else showMenu();

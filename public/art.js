// Hand-drawn-by-code artwork: scenery backdrops and character portraits as SVG.
// Everything is generated from the scene's setting/time/weather, so no image files
// or image generation is needed. The same location always draws the same way.

function rng(seedText = "") {
  let a = 2166136261;
  for (const ch of String(seedText)) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 900;

const SKIES = {
  dawn: ["#2b2d5c", "#c46a7a", "#f6c99b"],
  day: ["#3d7fc0", "#7fb6e3", "#cfe8f7"],
  dusk: ["#24163a", "#8f3a63", "#f0904b"],
  night: ["#03050f", "#0d1730", "#22345a"],
};

// How light the landscape is at each time of day (0 = silhouette black, 1 = full colour).
const LIGHT = { dawn: 0.55, day: 1, dusk: 0.45, night: 0.22 };

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * amount)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

function skyGradient(time) {
  const [top, mid, low] = SKIES[time] || SKIES.day;
  return `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${top}"/><stop offset="0.6" stop-color="${mid}"/><stop offset="1" stop-color="${low}"/>
  </linearGradient>`;
}

function celestial(time, r) {
  if (time === "night") {
    let stars = "";
    for (let i = 0; i < 120; i++) {
      stars += `<circle cx="${r() * W}" cy="${r() * H * 0.6}" r="${r() * 1.8 + 0.4}" fill="#fff" opacity="${r() * 0.7 + 0.3}"/>`;
    }
    return `${stars}<circle cx="${1200 + r() * 200}" cy="${140 + r() * 60}" r="46" fill="#f4f1de"/>
      <circle cx="${1200 + r() * 200}" cy="140" r="120" fill="#f4f1de" opacity="0.06"/>`;
  }
  const y = { dawn: 560, day: 150, dusk: 540 }[time] ?? 150;
  const color = time === "day" ? "#fff6c9" : "#ffb36b";
  return `<circle cx="${300 + r() * 1000}" cy="${y}" r="70" fill="${color}" opacity="0.95"/>
    <circle cx="${300 + r() * 1000}" cy="${y}" r="180" fill="${color}" opacity="0.12"/>`;
}

// A wavy horizon line filled down to the bottom of the picture.
function ridge(r, baseY, roughness, color, step = 80) {
  let d = `M0 ${H} L0 ${baseY}`;
  for (let x = 0; x <= W + step; x += step) d += ` L${x} ${baseY - r() * roughness}`;
  return `<path d="${d} L${W} ${H} Z" fill="${color}"/>`;
}

function smoothHills(r, baseY, height, color) {
  let d = `M0 ${H} L0 ${baseY}`;
  let x = 0;
  while (x < W) {
    const w = 200 + r() * 300;
    d += ` Q${x + w / 2} ${baseY - height * (0.4 + r() * 0.6)} ${x + w} ${baseY}`;
    x += w;
  }
  return `<path d="${d} L${W} ${H} Z" fill="${color}"/>`;
}

function pine(x, y, h, color) {
  const w = h * 0.38;
  return `<path d="M${x} ${y - h} L${x - w * 0.6} ${y - h * 0.55} L${x - w * 0.3} ${y - h * 0.55} L${x - w} ${y - h * 0.1} L${x - w * 0.15} ${y - h * 0.1} L${x - w * 0.15} ${y} L${x + w * 0.15} ${y} L${x + w * 0.15} ${y - h * 0.1} L${x + w} ${y - h * 0.1} L${x + w * 0.3} ${y - h * 0.55} L${x + w * 0.6} ${y - h * 0.55} Z" fill="${color}"/>`;
}

function deadTree(x, y, h, color) {
  return `<g stroke="${color}" stroke-width="${h / 28}" stroke-linecap="round" fill="none">
    <path d="M${x} ${y} L${x + 4} ${y - h}"/>
    <path d="M${x + 2} ${y - h * 0.5} L${x - h * 0.25} ${y - h * 0.75}"/>
    <path d="M${x + 3} ${y - h * 0.7} L${x + h * 0.22} ${y - h * 0.95}"/>
    <path d="M${x - h * 0.12} ${y - h * 0.62} L${x - h * 0.2} ${y - h * 0.9}"/></g>`;
}

function glow(id, color) {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.85"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

function buildings(r, baseY, maxH, color, windowColor, windowChance) {
  let out = "";
  let x = -20;
  while (x < W) {
    const w = 70 + r() * 120;
    const h = maxH * (0.45 + r() * 0.55);
    const top = baseY - h;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${h + 20}" fill="${color}"/>`;
    out += r() < 0.7
      ? `<path d="M${x - 8} ${top} L${x + w / 2} ${top - 30 - r() * 40} L${x + w + 8} ${top} Z" fill="${color}"/>`
      : `<rect x="${x + w * 0.6}" y="${top - 30}" width="14" height="30" fill="${color}"/>`;
    for (let wy = top + 20; wy < baseY - 25; wy += 38) {
      for (let wx = x + 14; wx < x + w - 20; wx += 30) {
        if (r() < windowChance) out += `<rect x="${wx}" y="${wy}" width="12" height="18" fill="${windowColor}" opacity="0.9"/>`;
      }
    }
    x += w + r() * 10;
  }
  return out;
}

function castle(cx, baseY, color) {
  const tower = (x, w, h) =>
    `<rect x="${x}" y="${baseY - h}" width="${w}" height="${h}" fill="${color}"/>` +
    Array.from({ length: Math.floor(w / 16) }, (_, i) =>
      `<rect x="${x + i * 16}" y="${baseY - h - 14}" width="9" height="14" fill="${color}"/>`).join("") +
    `<rect x="${x + w / 2 - 4}" y="${baseY - h + 30}" width="8" height="18" fill="#f2c063" opacity="0.8"/>`;
  return [
    tower(cx - 260, 200, 210),
    tower(cx + 60, 200, 210),
    tower(cx - 330, 80, 330),
    tower(cx + 250, 80, 330),
    tower(cx - 60, 120, 400),
    `<path d="M${cx - 66} ${baseY - 400} L${cx} ${baseY - 500} L${cx + 66} ${baseY - 400} Z" fill="${color}"/>`,
    `<path d="M${cx - 40} ${baseY} L${cx - 40} ${baseY - 70} Q${cx} ${baseY - 120} ${cx + 40} ${baseY - 70} L${cx + 40} ${baseY} Z" fill="#000" opacity="0.5"/>`,
  ].join("");
}

function torch(x, y) {
  return `<rect x="${x - 4}" y="${y}" width="8" height="40" fill="#3b2a1a"/>
    <circle cx="${x}" cy="${y - 4}" r="90" fill="url(#fireglow)"/>
    <path d="M${x} ${y - 30} Q${x + 12} ${y - 8} ${x} ${y + 2} Q${x - 12} ${y - 8} ${x} ${y - 30} Z" fill="#ffcf5a"/>`;
}

function bricks(r, top, bottom, base) {
  let out = `<rect x="0" y="${top}" width="${W}" height="${bottom - top}" fill="${base}"/>`;
  for (let y = top, row = 0; y < bottom; y += 46, row++) {
    for (let x = row % 2 ? -50 : 0; x < W; x += 100) {
      out += `<rect x="${x + 2}" y="${y + 2}" width="96" height="42" rx="3" fill="${mix(base, "#000000", 0.15 + r() * 0.25)}"/>`;
    }
  }
  return out;
}

function stalactites(r, color, fromTop = true) {
  let d = "";
  for (let x = 0; x < W; x += 40 + r() * 60) {
    const len = 60 + r() * 200;
    const w = 20 + r() * 40;
    d += fromTop
      ? `M${x} 0 L${x + w / 2} ${len} L${x + w} 0 Z `
      : `M${x} ${H} L${x + w / 2} ${H - len * 0.6} L${x + w} ${H} Z `;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

const OUTDOOR = new Set(["forest", "town", "castle", "mountains", "sea", "desert", "swamp", "camp", "road", "otherworld"]);

function outdoorScene(setting, time, r) {
  const L = LIGHT[time] ?? 1;
  const far = shade("#5d7a8c", L);
  const mid = shade("#3f5a48", L);
  const near = shade("#24382b", L);
  let s = `<rect width="${W}" height="${H}" fill="url(#sky)"/>${celestial(time, r)}`;

  switch (setting) {
    case "forest":
      s += smoothHills(r, 560, 160, far);
      for (let i = 0; i < 40; i++) s += pine(r() * W, 600 + r() * 30, 160 + r() * 80, shade("#2f4f3a", L * 0.9));
      s += ridge(r, 700, 30, mid);
      for (let i = 0; i < 18; i++) s += pine(r() * W, 880, 320 + r() * 220, near);
      break;
    case "mountains": {
      s += ridge(r, 520, 260, far, 140);
      let d = `M0 ${H} L0 640`;
      let caps = "";
      for (let x = 0; x <= W; x += 260) {
        const peak = 260 + r() * 180;
        const base = 560 + r() * 80;
        d += ` L${x + 130} ${peak} L${x + 260} ${base}`;
        // Snow cap: follow both slopes down a little way from the peak.
        const t = 0.28;
        const left = [x + 130 - 130 * t, peak + (640 - peak) * t];
        const right = [x + 130 + 130 * t, peak + (base - peak) * t];
        caps += `<path d="M${x + 130} ${peak} L${right[0]} ${right[1]} L${x + 140} ${right[1] - 12} L${x + 125} ${left[1] + 4} L${left[0]} ${left[1]} Z" fill="${shade("#f1f4f8", L)}"/>`;
      }
      s += `<path d="${d} L${W} ${H} Z" fill="${shade("#556270", L)}"/>${caps}`;
      s += ridge(r, 780, 60, near);
      break;
    }
    case "sea": {
      s += `<rect y="520" width="${W}" height="${H - 520}" fill="${shade("#1e4f72", L)}"/>`;
      for (let i = 0; i < 70; i++) {
        const y = 540 + r() * 360;
        const x = r() * W;
        s += `<path d="M${x} ${y} q20 -8 40 0" stroke="${shade("#9cc9e6", L)}" stroke-width="2" fill="none" opacity="0.6"/>`;
      }
      const sx = 200 + r() * 1000;
      s += `<g fill="${shade("#2b1d14", L)}"><path d="M${sx} 560 L${sx + 220} 560 L${sx + 190} 600 L${sx + 30} 600 Z"/>
        <rect x="${sx + 105}" y="400" width="6" height="160"/>
        <path d="M${sx + 112} 410 Q${sx + 190} 470 ${sx + 112} 540 Z" fill="${shade("#d8cfb8", L)}"/></g>`;
      break;
    }
    case "desert":
      s += smoothHills(r, 600, 120, shade("#d9a65e", L));
      s += smoothHills(r, 720, 140, shade("#c48a46", L));
      s += smoothHills(r, 860, 120, shade("#a86f33", L));
      break;
    case "swamp":
      s += smoothHills(r, 580, 80, shade("#3e4a3a", L));
      s += `<rect y="620" width="${W}" height="${H - 620}" fill="${shade("#2c3a2a", L)}"/>`;
      s += `<rect y="680" width="${W}" height="220" fill="${shade("#405a4e", L)}" opacity="0.6"/>`;
      for (let i = 0; i < 9; i++) s += deadTree(r() * W, 700 + r() * 120, 200 + r() * 200, shade("#1d241b", L));
      for (let i = 0; i < 60; i++) {
        const x = r() * W;
        s += `<path d="M${x} ${H} l${r() * 10 - 5} ${-40 - r() * 60}" stroke="${shade("#4d5f33", L)}" stroke-width="3"/>`;
      }
      break;
    case "town":
      s += smoothHills(r, 600, 80, far);
      s += buildings(r, 760, 300, shade("#3a3340", L), "#f6c45a", time === "day" ? 0.05 : 0.45);
      s += `<rect y="760" width="${W}" height="${H - 760}" fill="${shade("#4a4038", L)}"/>`;
      for (let x = 0; x < W; x += 60) s += `<rect x="${x + (r() * 10)}" y="${790 + r() * 80}" width="40" height="14" rx="4" fill="${shade("#5c5046", L)}"/>`;
      break;
    case "castle":
      s += smoothHills(r, 620, 100, far);
      s += castle(800, 640, shade("#2e2a35", L));
      s += smoothHills(r, 760, 120, mid);
      s += ridge(r, 860, 30, near);
      break;
    case "camp":
      s += smoothHills(r, 580, 140, far);
      for (let i = 0; i < 25; i++) s += pine(r() * W, 640, 160 + r() * 90, shade("#253a2d", L));
      s += `<rect y="640" width="${W}" height="${H - 640}" fill="${shade("#3c4630", L)}"/>`;
      s += `<path d="M300 760 L420 600 L540 760 Z" fill="${shade("#7a5a3a", Math.max(L, 0.5))}"/><path d="M420 600 L440 760 L400 760 Z" fill="#000" opacity="0.4"/>`;
      s += `<path d="M1080 780 L1220 610 L1360 780 Z" fill="${shade("#5b6a4a", Math.max(L, 0.5))}"/>`;
      s += `<circle cx="800" cy="760" r="300" fill="url(#fireglow)" opacity="0.8"/>`;
      s += `<path d="M760 790 L840 770 M770 770 L840 795" stroke="#3b2a1a" stroke-width="12" stroke-linecap="round"/>`;
      s += `<path d="M800 690 Q835 740 812 785 L788 785 Q765 740 800 690 Z" fill="#ff9a3c"/><path d="M800 725 Q818 755 806 785 L794 785 Q783 755 800 725 Z" fill="#ffe08a"/>`;
      break;
    case "road":
      s += smoothHills(r, 560, 120, far);
      s += smoothHills(r, 680, 120, mid);
      s += `<path d="M760 560 Q700 650 820 720 Q1000 820 900 ${H} L1300 ${H} Q1250 820 960 700 Q800 640 790 560 Z" fill="${shade("#9a8466", L)}"/>`;
      s += `<g fill="${shade("#3b2a1a", L)}"><rect x="1240" y="600" width="12" height="160"/><path d="M1180 610 L1330 610 L1350 630 L1330 650 L1180 650 Z"/></g>`;
      for (let i = 0; i < 6; i++) s += pine(r() < 0.5 ? r() * 500 : 1300 + r() * 300, 880, 260 + r() * 200, near);
      break;
    case "otherworld":
      for (let i = 0; i < 6; i++) {
        const x = r() * W;
        const y = 150 + r() * 400;
        const w = 120 + r() * 200;
        s += `<path d="M${x} ${y} L${x + w} ${y} L${x + w * 0.6} ${y + w * 0.7} L${x + w * 0.4} ${y + w * 0.5} Z" fill="${shade("#3a2d5c", L + 0.3)}"/>
          <rect x="${x}" y="${y - 6}" width="${w}" height="10" fill="${shade("#4fd1c5", L + 0.3)}"/>`;
      }
      s += `<circle cx="800" cy="450" r="320" fill="none" stroke="#c084fc" stroke-width="3" opacity="0.4" stroke-dasharray="20 14"/>`;
      s += ridge(r, 820, 80, "#160f29");
      break;
  }
  return s;
}

function indoorScene(setting, time, r) {
  let s = "";
  switch (setting) {
    case "tavern":
      s += `<rect width="${W}" height="${H}" fill="#3b2516"/>`;
      for (let x = 0; x < W; x += 90) s += `<rect x="${x}" y="0" width="86" height="${H}" fill="${mix("#5a3a22", "#2a1a0f", r() * 0.5)}"/>`;
      s += `<rect y="80" width="${W}" height="40" fill="#24150b"/><rect y="0" width="${W}" height="30" fill="#24150b"/>`;
      for (const x of [300, 800, 1300]) {
        s += `<circle cx="${x}" cy="230" r="260" fill="url(#fireglow)" opacity="0.7"/>
          <line x1="${x}" y1="120" x2="${x}" y2="200" stroke="#111" stroke-width="3"/>
          <rect x="${x - 16}" y="200" width="32" height="44" rx="6" fill="#ffcf6b"/>`;
      }
      s += `<rect x="0" y="600" width="${W}" height="300" fill="#2a1a0e"/><rect x="0" y="590" width="${W}" height="28" fill="#6b4524"/>`;
      for (const x of [120, 1380]) {
        s += `<ellipse cx="${x + 60}" cy="520" rx="70" ry="80" fill="#5c3a1e"/><rect x="${x - 10}" y="470" width="140" height="10" fill="#2a1a0e"/><rect x="${x - 10}" y="560" width="140" height="10" fill="#2a1a0e"/>`;
      }
      for (let i = 0; i < 6; i++) s += `<rect x="${500 + i * 110}" y="${545 - (i % 2) * 8}" width="34" height="${45 + (i % 2) * 8}" rx="4" fill="${["#8a5a2b", "#3f6b4a", "#7a2f2f"][i % 3]}" opacity="0.9"/>`;
      break;
    case "dungeon":
      s += bricks(r, 0, H, "#3a3a44");
      s += `<rect width="${W}" height="${H}" fill="#000" opacity="0.35"/>`;
      s += `<path d="M640 ${H} L640 420 Q800 260 960 420 L960 ${H} Z" fill="#07070a"/>`;
      s += `<path d="M640 420 Q800 260 960 420" stroke="#55556a" stroke-width="18" fill="none"/>`;
      s += torch(450, 380) + torch(1150, 380);
      for (const x of [200, 1400]) s += `<path d="M${x} 0 L${x} 300" stroke="#222" stroke-width="6" stroke-dasharray="14 6"/>`;
      s += `<rect y="800" width="${W}" height="100" fill="#1d1d24"/>`;
      break;
    case "cave":
    case "underdark": {
      const rock = setting === "cave" ? "#2a2622" : "#1b1426";
      s += `<rect width="${W}" height="${H}" fill="${rock}"/>`;
      s += `<ellipse cx="800" cy="520" rx="520" ry="330" fill="${setting === "cave" ? "#4a4038" : "#2c1f40"}"/>`;
      s += `<ellipse cx="800" cy="560" rx="300" ry="190" fill="${setting === "cave" ? "#6b5a48" : "#3f2c63"}" opacity="0.7"/>`;
      s += stalactites(r, rock) + stalactites(r, mix(rock, "#000000", 0.3), false);
      if (setting === "underdark") {
        for (let i = 0; i < 14; i++) {
          const x = r() * W;
          const y = 760 + r() * 120;
          const c = r() < 0.5 ? "#62f5d5" : "#c084fc";
          s += `<circle cx="${x}" cy="${y - 30}" r="70" fill="${c}" opacity="0.12"/><rect x="${x - 4}" y="${y - 30}" width="8" height="34" fill="#cfc7e6"/><ellipse cx="${x}" cy="${y - 30}" rx="${22 + r() * 18}" ry="14" fill="${c}"/>`;
        }
      } else {
        s += torch(1200, 520);
      }
      break;
    }
    case "temple":
      s += `<rect width="${W}" height="${H}" fill="#2a2630"/>`;
      s += `<path d="M700 120 Q800 20 900 120 L900 420 L700 420 Z" fill="#c9a227" opacity="0.25"/>`;
      s += `<path d="M720 130 Q800 50 880 130 L880 400 L720 400 Z" fill="#6d4bd1"/><path d="M800 70 L800 400 M720 230 L880 230" stroke="#2a2630" stroke-width="10"/>`;
      s += `<path d="M700 420 L520 ${H} L1080 ${H} L900 420 Z" fill="#f6e7b0" opacity="0.12"/>`;
      for (const x of [150, 420, 1100, 1370]) {
        s += `<rect x="${x}" y="80" width="80" height="740" fill="#5a5466"/><rect x="${x - 15}" y="60" width="110" height="30" fill="#6c6578"/><rect x="${x - 15}" y="800" width="110" height="30" fill="#6c6578"/>`;
      }
      s += `<rect x="650" y="640" width="300" height="120" fill="#4a4456"/><rect x="630" y="620" width="340" height="24" fill="#6c6578"/>`;
      s += `<circle cx="680" cy="600" r="60" fill="url(#fireglow)"/><circle cx="920" cy="600" r="60" fill="url(#fireglow)"/>`;
      s += `<rect y="830" width="${W}" height="70" fill="#1c1a21"/>`;
      break;
  }
  if (time === "night") s += `<rect width="${W}" height="${H}" fill="#000814" opacity="0.25"/>`;
  return s;
}

/** Returns an SVG string for a scene backdrop. */
export function sceneSVG({ setting = "road", time = "day", seed = "" } = {}) {
  const r = rng(`${setting}:${seed}`);
  const defs = `<defs>${skyGradient(time)}${glow("fireglow", "#ff9a3c")}</defs>`;
  const body = OUTDOOR.has(setting) ? outdoorScene(setting, time, r) : indoorScene(setting, time, r);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">${defs}${body}</svg>`;
}

// ---------- Portraits ----------

const EMBLEM_PATHS = {
  sword: `<path d="M50 14 L56 20 L56 62 L44 62 L44 20 Z"/><rect x="34" y="62" width="32" height="6" rx="2"/><rect x="47" y="68" width="6" height="14"/><circle cx="50" cy="86" r="5"/>`,
  dagger: `<path d="M50 26 L56 34 L55 62 L45 62 L44 34 Z"/><rect x="38" y="62" width="24" height="5" rx="2"/><rect x="47" y="67" width="6" height="14"/>`,
  staff: `<rect x="47" y="30" width="6" height="58" rx="3"/><circle cx="50" cy="24" r="11"/><circle cx="50" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6"/>`,
  bow: `<path d="M38 14 Q78 50 38 86" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="38" y1="14" x2="38" y2="86" stroke="currentColor" stroke-width="2"/><path d="M30 50 L70 50 M62 44 L70 50 L62 56" stroke="currentColor" stroke-width="3" fill="none"/>`,
  shield: `<path d="M50 14 L80 24 Q80 66 50 88 Q20 66 20 24 Z"/>`,
  holy: `<circle cx="50" cy="50" r="14"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><line x1="50" y1="16" x2="50" y2="28"/><line x1="50" y1="72" x2="50" y2="84"/><line x1="16" y1="50" x2="28" y2="50"/><line x1="72" y1="50" x2="84" y2="50"/><line x1="26" y1="26" x2="34" y2="34"/><line x1="66" y1="66" x2="74" y2="74"/><line x1="74" y1="26" x2="66" y2="34"/><line x1="34" y1="66" x2="26" y2="74"/></g>`,
  music: `<ellipse cx="38" cy="72" rx="12" ry="9"/><ellipse cx="68" cy="64" rx="12" ry="9"/><path d="M48 72 L48 22 L78 14 L78 64 L72 64 L72 26 L54 31 L54 72 Z"/>`,
  beast: `<ellipse cx="50" cy="64" rx="18" ry="15"/><circle cx="28" cy="44" r="8"/><circle cx="42" cy="30" r="8"/><circle cx="58" cy="30" r="8"/><circle cx="72" cy="44" r="8"/>`,
  skull: `<path d="M50 16 C28 16 20 32 22 50 C23 60 30 62 32 66 L32 78 L68 78 L68 66 C70 62 77 60 78 50 C80 32 72 16 50 16 Z"/><circle cx="39" cy="48" r="8" fill="#000" opacity="0.7"/><circle cx="61" cy="48" r="8" fill="#000" opacity="0.7"/><path d="M50 56 L45 64 L55 64 Z" fill="#000" opacity="0.7"/>`,
  crown: `<path d="M18 70 L22 30 L36 50 L50 22 L64 50 L78 30 L82 70 Z"/><rect x="18" y="72" width="64" height="10" rx="2"/>`,
  flame: `<path d="M50 12 C58 32 76 40 74 62 C72 80 60 88 50 88 C40 88 28 80 26 62 C25 48 36 44 38 30 C44 40 46 46 50 48 C54 36 52 24 50 12 Z"/>`,
  leaf: `<path d="M22 78 C22 40 46 18 82 18 C82 54 60 78 22 78 Z"/><path d="M22 78 L66 34" stroke="#000" stroke-opacity="0.35" stroke-width="3"/>`,
  eye: `<path d="M12 50 Q50 14 88 50 Q50 86 12 50 Z"/><circle cx="50" cy="50" r="14" fill="#000" opacity="0.75"/><circle cx="55" cy="45" r="4" fill="#fff"/>`,
  coin: `<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="24" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="4"/><path d="M44 38 L56 38 L56 62 L44 62" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="4"/>`,
  hammer: `<rect x="46" y="38" width="8" height="50" rx="3"/><rect x="24" y="16" width="52" height="26" rx="4"/>`,
};

export function emblemSVG(emblem, color = "#fff") {
  return `<svg viewBox="0 0 100 100" style="color:${color}" fill="currentColor">${EMBLEM_PATHS[emblem] || EMBLEM_PATHS.sword}</svg>`;
}

const SKIN = ["#f1d3b8", "#e0b48f", "#c68d63", "#9a6643", "#6e4a33"];
const HAIR = ["#2b1d14", "#5a3a22", "#a8743a", "#d9c28a", "#8a2f1f", "#d8d8d8", "#1c1c28"];

function humanoidHead(r, color, dark, light) {
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const style = Math.floor(r() * 4); // 0 hood, 1 short hair, 2 long hair, 3 beard
  const skinShade = mix(skin, "#000000", 0.25);
  const back =
    style === 0 ? `<path d="M52 140 C40 70 60 34 100 32 C140 34 160 70 148 140 Z" fill="${dark}"/>` :
    style === 2 ? `<path d="M58 150 C48 80 62 40 100 40 C138 40 152 80 142 150 L128 150 C134 100 126 70 100 70 C74 70 66 100 72 150 Z" fill="${hair}"/>` : "";
  const front =
    style === 0 ? `<path d="M60 96 C60 50 140 50 140 96 C136 66 120 54 100 54 C80 54 64 66 60 96 Z" fill="${mix(color, "#000000", 0.3)}"/>` :
    style === 3 ? `<path d="M64 86 C62 52 138 52 136 86 C130 66 70 66 64 86 Z" fill="${hair}"/>
      <path d="M68 100 C70 150 130 150 132 100 C122 116 110 112 100 112 C90 112 78 116 68 100 Z" fill="${hair}"/>` :
    `<path d="M62 90 C58 50 142 50 138 90 C134 66 110 60 100 66 C90 60 66 66 62 90 Z" fill="${hair}"/>`;
  return `${back}
    <rect x="88" y="118" width="24" height="26" fill="${skinShade}"/>
    <ellipse cx="100" cy="94" rx="36" ry="40" fill="${skin}"/>
    <ellipse cx="64" cy="98" rx="6" ry="10" fill="${skinShade}"/><ellipse cx="136" cy="98" rx="6" ry="10" fill="${skinShade}"/>
    <ellipse cx="86" cy="96" rx="4" ry="5" fill="#1b1410"/><ellipse cx="114" cy="96" rx="4" ry="5" fill="#1b1410"/>
    <path d="M80 84 L92 82 M108 82 L120 84" stroke="${style === 0 ? "#1b1410" : hair}" stroke-width="3" stroke-linecap="round"/>
    <path d="M100 100 L97 110 L102 110" stroke="${skinShade}" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${style === 3 ? "" : `<path d="M91 119 Q100 124 109 119" stroke="#7a3b2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>`}
    ${front}`;
}

function creatureHead(color, dark, light) {
  return `<path d="M100 40 C70 40 62 66 64 92 C66 112 82 132 100 136 C118 132 134 112 136 92 C138 66 130 40 100 40 Z" fill="${dark}"/>
    <path d="M70 60 L48 14 L84 48 Z M130 60 L152 14 L116 48 Z" fill="${mix(color, "#000000", 0.7)}"/>
    <ellipse cx="85" cy="88" rx="16" ry="10" fill="${light}" opacity="0.25"/><ellipse cx="115" cy="88" rx="16" ry="10" fill="${light}" opacity="0.25"/>
    <ellipse cx="85" cy="88" rx="8" ry="4" fill="${light}"/><ellipse cx="115" cy="88" rx="8" ry="4" fill="${light}"/>
    <path d="M84 116 L90 110 L96 116 L102 110 L108 116 L114 110" stroke="${light}" stroke-width="2" fill="none" opacity="0.6"/>`;
}

/** A stylised bust in the character's colour, wearing their emblem. */
export function portraitSVG(character) {
  const color = /^#[0-9a-f]{6}$/i.test(character.color || "") ? character.color : "#7a6cff";
  const dark = mix(color, "#000000", 0.55);
  const light = mix(color, "#ffffff", 0.45);
  const key = character.id || character.name || "x";
  const gid = `p${Math.abs([...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`;
  const head = character.kind === "creature"
    ? creatureHead(color, dark, light)
    : humanoidHead(rng(key), color, dark, light);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" class="portrait-svg">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    </defs>
    <path d="M14 260 C14 184 46 144 100 140 C154 144 186 184 186 260 Z" fill="url(#${gid})"/>
    <path d="M68 146 L100 186 L132 146" stroke="${dark}" stroke-width="6" fill="none" opacity="0.7"/>
    ${head}
    <g transform="translate(76 196) scale(0.48)">
      <circle cx="50" cy="50" r="48" fill="${dark}" stroke="${light}" stroke-width="4"/>
      <g transform="translate(18 18) scale(0.64)" fill="${light}" style="color:${light}">${EMBLEM_PATHS[character.emblem] || EMBLEM_PATHS.sword}</g>
    </g>
  </svg>`;
}

#!/usr/bin/env node
/**
 * Builds the sample recording the browser build opens on localhost
 * (dev/sample/Sample recording). It's a made-up project tracker, drawn as SVG
 * frames, rasterized with qlmanage and encoded with ffmpeg into the same
 * package layout a real capture writes (docs/ARCHITECTURE.md §4): screen.mp4,
 * session.json and the input tracks. The cursor isn't in the video; it lives
 * in moves.jsonl and clicks.jsonl and the editor re-renders it, as with a
 * real recording.
 *
 * Needs macOS (qlmanage) and ffmpeg with libx264. Run from the repo root:
 *   node scripts/make-sample-recording.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const OUT = resolve("dev/sample/Sample recording");
const W = 1440, H = 900, SCALE = 2, FPS = 60, DURATION = 36;
/** Where the captured window sat on screen, in global points. Input tracks are global, like a real capture. */
const ORIGIN = { x: 36, y: 60 };
/** The video starts this far into the session clock, as it does in a real capture. */
const VIDEO_START_MS = 312.5;

/* ───────── Script: where the cursor goes and what each click does ───────── */

// Each step moves the cursor to a point (local points) over `move` seconds, then
// optionally clicks at `at` (video seconds). Clicks drive the UI state below.
const STEPS = [
  { to: [760, 420], at: 0, move: 0 },
  { to: [1334, 32], from: 1.6, move: 1.4, click: 3.4, id: "new" },
  { to: [720, 342], from: 3.9, move: 0.45, click: 4.4, id: "field" },
  { to: [893, 506], from: 7.9, move: 0.9, click: 9.0, id: "create" },
  { to: [470, 214], from: 10.4, move: 1.2 },
  { to: [96, 252], from: 12.6, move: 1.3, click: 14.4, id: "settings" },
  { to: [1352, 196], from: 15.2, move: 1.2, click: 17.0, id: "toggle1" },
  { to: [1352, 340], from: 18.0, move: 0.7, click: 19.4, id: "toggle3" },
  { to: [96, 212], from: 20.4, move: 1.0, click: 21.8, id: "team" },
  { to: [1350, 32], from: 22.4, move: 0.9, click: 23.6, id: "invite" },
  { to: [720, 342], from: 24.0, move: 0.4, click: 24.5, id: "email" },
  { to: [868, 506], from: 28.0, move: 0.8, click: 29.0, id: "send" },
  { to: [96, 172], from: 31.4, move: 1.1, click: 33.0, id: "projects" },
  { to: [640, 300], from: 33.6, move: 1.4 },
];
const clickAt = Object.fromEntries(STEPS.filter((s) => s.click).map((s) => [s.id, s.click]));
const PROJECT_NAME = "Q4 launch video";
const EMAIL = "maya@northwind.co";
const TYPE = { project: { from: 4.8, step: 0.17 }, email: { from: 24.9, step: 0.15 } };

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const ramp = (t, start, length) => clamp01((t - start) / length);
/** Quantized so fades produce a handful of distinct frames, not one per tick. */
const q = (k, steps = 8) => Math.round(k * steps) / steps;

function cursorAt(t) {
  let pos = STEPS[0].to;
  for (const s of STEPS.slice(1)) {
    if (t < s.from) break;
    const k = ease(ramp(t, s.from, s.move));
    // A slight arc, the way a hand moves a mouse.
    const [ax, ay] = pos, [bx, by] = s.to;
    const lift = Math.sin(k * Math.PI) * Math.min(60, Math.hypot(bx - ax, by - ay) * 0.08);
    pos = [ax + (bx - ax) * k, ay + (by - ay) * k - lift];
    if (k < 1) break;
    pos = s.to;
  }
  return pos;
}

function typed(t, text, { from, step }) {
  return text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - from) / step) + 1)));
}

/* ───────── UI state at time t ───────── */

function stateAt(t) {
  const view = t >= clickAt.projects ? "projects" : t >= clickAt.team ? "team" : t >= clickAt.settings ? "settings" : "projects";
  const pressed = Object.entries(clickAt).find(([, at]) => t >= at && t < at + 0.14)?.[0];
  const caret = Math.floor(t * 2) % 2 === 0;

  let modal = null;
  if (t >= clickAt.new + 0.15 && t < clickAt.create + 0.4) {
    const fadeIn = ramp(t, clickAt.new + 0.15, 0.25), fadeOut = 1 - ramp(t, clickAt.create + 0.12, 0.25);
    modal = { kind: "new", opacity: q(Math.min(fadeIn, fadeOut)), focused: t >= clickAt.field, text: t >= TYPE.project.from ? typed(t, PROJECT_NAME, TYPE.project) : "", caret };
  }
  if (t >= clickAt.invite + 0.15 && t < clickAt.send + 0.4) {
    const fadeIn = ramp(t, clickAt.invite + 0.15, 0.25), fadeOut = 1 - ramp(t, clickAt.send + 0.12, 0.25);
    modal = { kind: "invite", opacity: q(Math.min(fadeIn, fadeOut)), focused: t >= clickAt.email, text: t >= TYPE.email.from ? typed(t, EMAIL, TYPE.email) : "", caret };
  }
  const created = t >= clickAt.create + 0.35;
  const newRowGlow = created ? q(1 - ramp(t, clickAt.create + 1.6, 1.2), 6) : 0;
  // Knob position per switch, 0 off to 1 on. The first and third get flipped on.
  const toggles = [q(ramp(t, clickAt.toggle1, 0.18), 4), 1, q(ramp(t, clickAt.toggle3, 0.18), 4), 0];
  const invited = t >= clickAt.send + 0.35;
  const toastIn = q(ease(ramp(t, clickAt.send + 0.3, 0.3)) * (1 - ramp(t, clickAt.send + 3.4, 0.3)), 6);
  return { view, pressed, modal, created, newRowGlow, toggles, invited, toastIn };
}

/* ───────── Drawing ───────── */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = `font-family="-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif"`;
const text = (x, y, s, { size = 14, weight = 400, fill = "#1d1d1f", anchor = "start" } = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const rect = (x, y, w, h, fill, { r = 0, stroke, opacity } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}${opacity !== undefined ? ` opacity="${opacity}"` : ""}/>`;

const PROJECTS = [
  ["Onboarding refresh", "Ana Ruiz", "In review", "2h ago"],
  ["Pricing page", "Jon Bell", "Active", "Yesterday"],
  ["Mobile checkout", "Priya Nair", "Active", "Yesterday"],
  ["Help center search", "Leo Park", "Paused", "3 days ago"],
  ["Billing emails", "Ana Ruiz", "Done", "Last week"],
  ["Design tokens v2", "Sam Ortiz", "Active", "Last week"],
  ["Referral program", "Jon Bell", "Done", "Oct 12"],
  ["Status page", "Leo Park", "Paused", "Oct 3"],
];
const STATUS = { "In review": ["#fff4d6", "#8a6100"], Active: ["#e2f3e8", "#1d6b3a"], Paused: ["#eeeeec", "#5f5f5c"], Done: ["#e6eefc", "#2a4fa3"], New: ["#e6eefc", "#2a4fa3"] };
const TEAM = [["Ana Ruiz", "ana@northwind.co", "Admin"], ["Jon Bell", "jon@northwind.co", "Editor"], ["Priya Nair", "priya@northwind.co", "Editor"], ["Leo Park", "leo@northwind.co", "Viewer"], ["Sam Ortiz", "sam@northwind.co", "Editor"]];
const SETTINGS = [["Email digests", "A summary of project changes every Monday"], ["Desktop notifications", "When someone mentions you or assigns a task"], ["Weekend quiet hours", "Hold notifications from Friday evening to Monday"], ["Public share links", "Anyone with the link can view a project"]];

function sidebar(view) {
  const items = [["Inbox", 132], ["Projects", 172], ["Team", 212], ["Settings", 252]];
  return [
    rect(0, 0, 232, H, "#f2f2f0"),
    rect(231, 0, 1, H, "#e2e2df"),
    rect(20, 22, 28, 28, "#1d1d1f", { r: 8 }),
    text(34, 41, "N", { size: 15, weight: 700, fill: "#fff", anchor: "middle" }),
    text(60, 41, "Northwind", { size: 15, weight: 600 }),
    ...items.map(([label, y]) => {
      const active = label.toLowerCase() === view;
      return (active ? rect(12, y - 24, 208, 36, "#e4e4e1", { r: 8 }) : "") + text(32, y, label, { weight: active ? 600 : 400, fill: active ? "#1d1d1f" : "#55554f" });
    }),
    text(32, 840, "Free plan · 3 seats left", { size: 12, fill: "#8a8a85" }),
  ].join("");
}

function topbar(title, button, pressed) {
  return [
    rect(232, 0, W - 232, 64, "#ffffff"),
    rect(232, 63, W - 232, 1, "#ececea"),
    text(264, 39, title, { size: 18, weight: 600 }),
    button ? rect(1260, 16, 148, 32, pressed ? "#000" : "#1d1d1f", { r: 8 }) + text(1334, 37, button, { size: 13, weight: 600, fill: "#fff", anchor: "middle" }) : "",
  ].join("");
}

function pill(x, y, label) {
  const [bg, fg] = STATUS[label];
  const w = label.length * 7 + 20;
  return rect(x, y - 15, w, 22, bg, { r: 11 }) + text(x + w / 2, y, label, { size: 12, weight: 600, fill: fg, anchor: "middle" });
}

function projectsView(s) {
  const rows = s.created ? [[PROJECT_NAME, "You", "New", "Just now"], ...PROJECTS] : PROJECTS;
  const out = [topbar("Projects", "New project", s.pressed === "new"), rect(232, 64, W - 232, H - 64, "#fff")];
  out.push(text(264, 104, "Name", { size: 12, weight: 600, fill: "#8a8a85" }), text(760, 104, "Owner", { size: 12, weight: 600, fill: "#8a8a85" }), text(980, 104, "Status", { size: 12, weight: 600, fill: "#8a8a85" }), text(1200, 104, "Updated", { size: 12, weight: 600, fill: "#8a8a85" }));
  rows.forEach(([name, owner, status, updated], i) => {
    const y = 120 + i * 56;
    if (i === 0 && s.created && s.newRowGlow > 0) out.push(rect(248, y + 4, W - 264, 48, "#eaf1ff", { r: 8, opacity: s.newRowGlow }));
    out.push(rect(264, y + 55, W - 296, 1, "#f0f0ee"), text(264, y + 34, name, { weight: 500 }), text(760, y + 34, owner, { fill: "#55554f" }), pill(980, y + 33, status), text(1200, y + 34, updated, { fill: "#8a8a85" }));
  });
  return out.join("");
}

function settingsView(s) {
  const out = [topbar("Settings", null), rect(232, 64, W - 232, H - 64, "#fff"), text(264, 120, "Notifications", { size: 15, weight: 600 })];
  SETTINGS.forEach(([title, body], i) => {
    const y = 172 + i * 72, on = s.toggles[i];
    out.push(text(264, y + 6, title, { weight: 500 }), text(264, y + 28, body, { size: 13, fill: "#8a8a85" }), rect(264, y + 47, W - 296, 1, "#f0f0ee"));
    out.push(rect(1330, y - 12, 44, 26, on > 0.5 ? "#2f6bff" : "#d9d9d5", { r: 13 }), `<circle cx="${1343 + on * 18}" cy="${y + 1}" r="10" fill="#fff"/>`);
  });
  return out.join("");
}

function teamView(s) {
  const members = s.invited ? [...TEAM, ["Maya Chen", EMAIL, "Invited"]] : TEAM;
  const out = [topbar("Team", "Invite people", s.pressed === "invite"), rect(232, 64, W - 232, H - 64, "#fff")];
  members.forEach(([name, email, role], i) => {
    const y = 96 + i * 64;
    const initials = name.split(" ").map((p) => p[0]).join("");
    out.push(`<circle cx="284" cy="${y + 28}" r="18" fill="${["#f4d9c6", "#d6e4f5", "#dcefd9", "#efe1f5", "#f5ecc8", "#e6eefc"][i % 6]}"/>`, text(284, y + 33, initials, { size: 12, weight: 600, fill: "#3b3b38", anchor: "middle" }));
    out.push(text(316, y + 24, name, { weight: 500 }), text(316, y + 44, email, { size: 13, fill: "#8a8a85" }), text(1380, y + 33, role, { size: 13, fill: role === "Invited" ? "#2a4fa3" : "#55554f", anchor: "end" }), rect(264, y + 63, W - 296, 1, "#f0f0ee"));
  });
  return out.join("");
}

/** Rough width of 15px system text, enough to put the caret after what's typed. */
const textWidth = (s) => [...s].reduce((w, ch) => w + (/[iljt.,' ]/.test(ch) ? 4.2 : /[rf]/.test(ch) ? 5.4 : /[mw@MW]/.test(ch) ? 11 : 8), 0);

function modal(m, pressed) {
  const isNew = m.kind === "new";
  const out = [`<g opacity="${m.opacity}">`, rect(0, 0, W, H, "#0b0b0c", { opacity: 0.28 })];
  out.push(rect(460, 236, 520, 300, "#fff", { r: 14 }), text(492, 284, isNew ? "New project" : "Invite people", { size: 18, weight: 600 }));
  out.push(text(492, 312, isNew ? "Name" : "Email", { size: 12, weight: 600, fill: "#8a8a85" }));
  out.push(rect(492, 320, 456, 44, "#fff", { r: 8, stroke: m.focused ? "#2f6bff" : "#d9d9d5" }));
  const value = m.text || (isNew ? "Untitled project" : "name@company.com");
  out.push(text(506, 348, value, { size: 15, fill: m.text ? "#1d1d1f" : "#b0b0aa" }));
  if (m.focused && m.caret) out.push(rect(508 + textWidth(m.text), 331, 1.5, 22, "#1d1d1f"));
  out.push(text(492, 400, isNew ? "You can rename it later from the project page." : "They'll get an email with a link to join Northwind.", { size: 13, fill: "#8a8a85" }));
  const primary = isNew ? "create" : "send";
  out.push(rect(728, 486, 96, 40, "#f2f2f0", { r: 8 }), text(776, 511, "Cancel", { size: 13, weight: 600, anchor: "middle" }));
  out.push(rect(836, 486, 112, 40, pressed === primary ? "#000" : "#1d1d1f", { r: 8 }), text(892, 511, isNew ? "Create" : "Send invite", { size: 13, weight: 600, fill: "#fff", anchor: "middle" }));
  out.push("</g>");
  return out.join("");
}

function toast(k) {
  if (!k) return "";
  const y = 900 - 24 - 56 * k;
  return `<g opacity="${k}">${rect(1080, y, 336, 52, "#1d1d1f", { r: 10 })}${text(1100, y + 31, "Invite sent to " + EMAIL, { size: 13, weight: 500, fill: "#fff" })}</g>`;
}

function frame(t) {
  const s = stateAt(t);
  const body = s.view === "projects" ? projectsView(s) : s.view === "settings" ? settingsView(s) : teamView(s);
  // qlmanage renders square thumbnails, so the canvas is square and ffmpeg crops the top W×H.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${rect(0, 0, W, W, "#ffffff")}${sidebar(s.view)}${body}${s.modal ? modal(s.modal, s.pressed) : ""}${toast(s.toastIn)}</svg>`;
}

/* ───────── Render ───────── */

const work = mkdtempSync(join(tmpdir(), "sample-recording-"));
const svgDir = join(work, "svg"), pngDir = join(work, "png");
mkdirSync(svgDir); mkdirSync(pngDir);

// Consecutive identical frames collapse into one image held for several ticks.
const segments = [];
for (let i = 0; i < DURATION * FPS; i++) {
  const svg = frame(i / FPS);
  const last = segments.at(-1);
  if (last && last.svg === svg) last.frames++;
  else segments.push({ svg, frames: 1 });
}
segments.forEach((seg, i) => writeFileSync(join(svgDir, `f${String(i).padStart(4, "0")}.svg`), seg.svg));
console.log(`${segments.length} distinct frames for ${DURATION * FPS} ticks`);

const files = readdirSync(svgDir).sort();
for (let i = 0; i < files.length; i += 40) {
  execFileSync("qlmanage", ["-t", "-s", String(W * SCALE), "-o", pngDir, ...files.slice(i, i + 40).map((f) => join(svgDir, f))], { stdio: "ignore" });
}

const list = segments.map((seg, i) => `file '${join(pngDir, `f${String(i).padStart(4, "0")}.svg.png`)}'\nduration ${(seg.frames / FPS).toFixed(6)}`);
list.push(`file '${join(pngDir, `f${String(segments.length - 1).padStart(4, "0")}.svg.png`)}'`);
writeFileSync(join(work, "list.txt"), list.join("\n"));

const rec = join(OUT, "recording");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(rec, "input"), { recursive: true });
execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", join(work, "list.txt"),
  "-vf", `crop=${W * SCALE}:${H * SCALE}:0:0,fps=${FPS},format=yuv420p`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "stillimage",
  // One-second keyframes, like the capture encoder, so seeking costs the same.
  "-g", String(FPS), "-keyint_min", String(FPS), "-t", String(DURATION),
  "-movflags", "+faststart", join(rec, "screen.mp4"),
], { stdio: "inherit" });

/* ───────── Input tracks and session ───────── */

const toSession = (t) => +(VIDEO_START_MS + t * 1000).toFixed(3);
const moves = [];
let prev = null;
for (let i = 0; i <= DURATION * 120; i++) {
  const t = i / 120;
  const [x, y] = cursorAt(t);
  // Only write when the cursor moved, like the capture's position sampler.
  if (prev && Math.abs(prev[0] - x) < 0.05 && Math.abs(prev[1] - y) < 0.05) continue;
  prev = [x, y];
  moves.push({ t: toSession(t), x: +(ORIGIN.x + x).toFixed(3), y: +(ORIGIN.y + y).toFixed(3), c: "c0" });
}
const clicks = STEPS.filter((s) => s.click).flatMap((s) => {
  const [x, y] = s.to;
  const base = { x: ORIGIN.x + x, y: ORIGIN.y + y, button: "left", count: 1 };
  return [{ t: toSession(s.click), ...base, down: true }, { t: toSession(s.click + 0.08), ...base, down: false }];
});
const keys = [[PROJECT_NAME, TYPE.project], [EMAIL, TYPE.email]].flatMap(([str, { from, step }]) => [...str].map((ch, i) => ({ t: toSession(from + i * step), key: ch })));

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
writeFileSync(join(rec, "input/moves.jsonl"), jsonl(moves));
writeFileSync(join(rec, "input/clicks.jsonl"), jsonl(clicks));
writeFileSync(join(rec, "input/keys.jsonl"), jsonl(keys));
writeFileSync(join(rec, "input/scrolls.jsonl"), "");
writeFileSync(join(rec, "session.json"), JSON.stringify({
  format: 1,
  options: { target: { kind: "window", windowId: 1 }, fps: FPS, systemAudio: false, microphone: false, codec: "h264" },
  captureRect: { x: ORIGIN.x, y: ORIGIN.y, width: W, height: H },
  scale: SCALE,
  width: W * SCALE,
  height: H * SCALE,
  videoStartMs: VIDEO_START_MS,
  durationMs: DURATION * 1000,
  startedAtUnixMs: Date.UTC(2026, 10, 6, 10, 0),
}, null, 2) + "\n");
writeFileSync(join(OUT, "meta.json"), JSON.stringify({ format: 1, app_version: "sample", created_at: "2026-11-06T10:00:00Z" }, null, 2) + "\n");

rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${OUT}`);

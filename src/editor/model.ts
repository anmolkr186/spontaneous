import { BACKDROP_IMAGES } from "./backdrops.gen";
/**
 * Phase 1 mirror of the Rust project schema (docs/ARCHITECTURE.md §4).
 * In phase 2 these types are generated from Rust with specta and the store
 * becomes a read-only mirror of the Rust project; for now it owns the data.
 */

export type Seconds = number;
export type Author = "user" | "agent" | "auto";

export interface Clip { id: string; start: Seconds; end: Seconds; label: string; speed: number }

export interface Zoom {
  id: string;
  start: Seconds;
  end: Seconds;
  scale: number;
  /** Normalized focus point on the source frame. */
  target: { x: number; y: number };
  author: Author;
}

export type OverlayKind = "callout" | "highlight" | "blur" | "arrow" | "text" | "keys";
export interface Overlay { id: string; kind: OverlayKind; start: Seconds; end: Seconds; label: string; author: Author }

export type NoteIntent = "zoom" | "blur" | "callout" | "speed" | "cut" | "style";
export type NoteStatus = "open" | "queued" | "applying" | "applied" | "dismissed";
export type Rect = { x: number; y: number; w: number; h: number };
export interface Note {
  id: string;
  at: Seconds;
  text: string;
  intents: NoteIntent[];
  status: NoteStatus;
  /**
   * What `region` and `ink` are measured against (src/editor/space.ts).
   * "canvas": the whole output frame, backdrop included. Every note made now.
   * Absent: the recording, as notes were before 2026-11-06.
   */
  space?: "canvas";
  /** Normalized region the note points at, in `space`. */
  region?: Rect;
  /** Ink stroke as an SVG path in a 0–100 box, in `space`. */
  ink?: string;
  /**
   * The part of `region` that lies on the recording, 0–1 of the recording,
   * measured on the frame it was drawn on. Absent when the mark is only on the
   * backdrop. Zooms, blurs and callouts aim here.
   */
  screen?: Rect;
  voice?: { seconds: number };
  createdAt: string;
  resolvedBy?: string[];
}

/** A shot id from the shot library (src/editor/shots.ts). */
export type TemplateId = string;
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
/** A backdrop: "natural/<name>", "gradient/<name>" or a neutral ("graphite", "slate", "paper", "none"). */
export type BackgroundId = string;

export interface Spring { stiffness: number; damping: number; mass: number }

/** A real recording loaded from a .spontaneous package. Times are video seconds, positions are normalized to the frame. */
export interface RecordingRef {
  projectDir: string;
  videoSrc: string;
  width: number;
  height: number;
  cursor: { t: number; x: number; y: number }[];
  clicks: { t: number; x: number; y: number }[];
}

export interface Project {
  revision: number;
  /** Present once a real recording is loaded; until then the stage previews the shot on its own. */
  recording?: RecordingRef;
  name: string;
  folder: string;
  duration: Seconds;
  fps: number;
  aspect: Aspect;
  /** The shot from the library. */
  template: TemplateId;
  /** How the agent or you have tuned the shot's motion. */
  motion: { speed: number; amount: number };
  /** Where the shot plays: its move starts at `start` and the template runs for `length` (the move, then rest). */
  span: { start: Seconds; length: Seconds };
  background: BackgroundId;
  frame: { padding: number; radius: number; shadow: number };
  cursor: { size: number; smoothing: number; hideWhenIdle: boolean; clickRipple: boolean };
  springs: { screen: Spring; cursor: Spring };
  motionBlur: number;
  clips: Clip[];
  zooms: Zoom[];
  overlays: Overlay[];
  notes: Note[];
}

/**
 * Backdrops behind the frame. Two image sets, Natural and Gradient & ASCII,
 * built from backdrops/ by scripts/build_backdrops.py, plus a few quiet
 * neutrals from the graphite ramp for docs and support videos.
 */
export type BackdropSet = "natural" | "gradient" | "neutral";
export interface Backdrop {
  label: string;
  set: BackdropSet;
  /** CSS background for the stage. */
  css: string;
  /** A light version for thumbnails and swatches. */
  thumb: string;
}

export const DEFAULT_BACKDROP: BackgroundId = "natural/hero-67";

const NEUTRALS: Record<string, Backdrop> = {
  graphite: { label: "Graphite", set: "neutral", css: "radial-gradient(120% 100% at 50% 0%, #2c2c30 0%, #141416 60%, #0b0b0c 100%)", thumb: "" },
  slate: { label: "Slate", set: "neutral", css: "linear-gradient(170deg, #22262c 0%, #111317 100%)", thumb: "" },
  paper: { label: "Paper", set: "neutral", css: "linear-gradient(180deg, #f6f6f4 0%, #e7e7e3 100%)", thumb: "" },
  none: { label: "None", set: "neutral", css: "#000", thumb: "" },
};
for (const b of Object.values(NEUTRALS)) b.thumb = b.css;

const image = (path: string) => `url("${path}") center / cover no-repeat, #0b0b0c`;

export const BACKGROUNDS: Record<BackgroundId, Backdrop> = {
  ...Object.fromEntries(BACKDROP_IMAGES.map((b) => [b.id, { label: b.label, set: b.set, css: image(`/backdrops/${b.id}.webp`), thumb: image(`/backdrops/${b.set}/thumbs/${b.id.split("/")[1]}.webp`) }])),
  ...NEUTRALS,
};

/** The backdrop for an id, falling back to the default when an id is unknown (an older project, a removed image). */
export function backdrop(id: BackgroundId | undefined): Backdrop {
  return BACKGROUNDS[id ?? DEFAULT_BACKDROP] ?? BACKGROUNDS[DEFAULT_BACKDROP] ?? NEUTRALS.graphite!;
}

export const DEFAULT_SPRING: Spring = { stiffness: 200, damping: 40, mass: 2.25 };

export const mockProject: Project = {
  revision: 1,
  name: "Launch video",
  folder: "October launches",
  duration: 92,
  fps: 60,
  aspect: "16:9",
  template: "focus",
  motion: { speed: 1, amount: 1 },
  span: { start: 0, length: 2.5 },
  background: DEFAULT_BACKDROP,
  frame: { padding: 9, radius: 12, shadow: 60 },
  cursor: { size: 1.4, smoothing: 70, hideWhenIdle: true, clickRipple: true },
  springs: { screen: DEFAULT_SPRING, cursor: { stiffness: 470, damping: 70, mass: 3 } },
  motionBlur: 35,
  clips: [
    { id: "c1", start: 0, end: 31.5, label: "Onboarding", speed: 1 },
    { id: "c2", start: 31.5, end: 58, label: "Create project", speed: 1 },
    { id: "c3", start: 58, end: 92, label: "Share", speed: 1.5 },
  ],
  zooms: [
    { id: "z1", start: 4.2, end: 9.6, scale: 1.6, target: { x: 0.3, y: 0.28 }, author: "auto" },
    { id: "z2", start: 14, end: 19.5, scale: 2, target: { x: 0.88, y: 0.12 }, author: "auto" },
    { id: "z3", start: 36, end: 43, scale: 1.8, target: { x: 0.5, y: 0.6 }, author: "agent" },
    { id: "z4", start: 66, end: 72.5, scale: 1.4, target: { x: 0.62, y: 0.4 }, author: "user" },
  ],
  overlays: [
    { id: "o1", kind: "callout", start: 37, end: 42, label: "One click to start", author: "agent" },
    { id: "o2", kind: "blur", start: 48, end: 56, label: "Email", author: "agent" },
    { id: "o3", kind: "keys", start: 75, end: 78, label: "⌘ K", author: "auto" },
  ],
  notes: [
    {
      id: "n1", at: 12.4, text: "Zoom on the Create button and slow this part down a bit.",
      intents: ["zoom", "speed"], status: "open",
      region: { x: 0.79, y: 0.03, w: 0.2, h: 0.15 },
      ink: "M80 11 C 79 3, 98 2, 99 10 C 100 18, 82 19, 80 12",
      createdAt: "2m ago",
    },
    {
      id: "n2", at: 49, text: "Blur the email in the invite field.",
      intents: ["blur"], status: "applied", region: { x: 0.34, y: 0.52, w: 0.3, h: 0.08 },
      createdAt: "8m ago", resolvedBy: ["o2"],
    },
    {
      id: "n3", at: 63.5, text: "This section drags. Can we make the share flow feel snappier?",
      intents: ["speed", "cut"], status: "open", voice: { seconds: 6 }, createdAt: "just now",
    },
  ],
};

export function formatTime(t: Seconds, withFrames = false, fps = 60): string {
  const clamped = Math.max(0, t);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  if (!withFrames) return base;
  const f = Math.floor((clamped % 1) * fps);
  return `${base}.${String(f).padStart(2, "0")}`;
}

/** Where a note points on the recording, if it does: what zoom targets and blurs aim at. */
export function noteOnRecording(n: Note): Rect | undefined {
  return n.space === "canvas" ? n.screen : n.region;
}

/** Pin numbers as the Notes list shows them: notes in time order, dismissed ones left out. */
export function pinNumbers(notes: Note[]): Record<string, number> {
  const ordered = notes.filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);
  return Object.fromEntries(ordered.map((n, i) => [n.id, i + 1]));
}

/** How the agent reads note areas; send it once with any message that lists them. */
export const AREA_LEGEND = "Areas are 0–1 (x, y from the top left). \"frame\" is the whole output video, backdrop included; \"recording\" is the screen recording inside it, the space zoom targets use.";

/**
 * A note's area in words for the agent, or "" when it has none:
 * "frame x 0.62 y 0.08 w 0.2 h 0.15, on the recording at x 0.7 y 0.02 w 0.25 h 0.2".
 */
export function noteArea(n: Note): string {
  if (!n.region) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  const box = (b: Rect) => `x ${r(b.x)} y ${r(b.y)} w ${r(b.w)} h ${r(b.h)}`;
  if (n.space !== "canvas") return `recording ${box(n.region)}`;
  return `frame ${box(n.region)}, ${n.screen ? `on the recording at ${box(n.screen)}` : "on the backdrop, off the recording"}`;
}

export const uid = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

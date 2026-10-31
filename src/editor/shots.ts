/**
 * The shot library: where a recording is placed and how the camera moves.
 *
 * A shot is a starting pose plus a few motion primitives. Primitives are plain
 * data (what moves, from where to where, when, on what curve), so the agent can
 * retune a shot from a description ("slower", "a bigger orbit", "less movement")
 * by changing speed and amount, or by swapping primitives.
 *
 * Two sets:
 *   Basics         clean framings for demos, docs and support videos
 *   Director's Cut cinematic shots for launches, built on device models
 */

export type ShotSet = "basics" | "directors-cut";
export type ShotDevice = "browser" | "window" | "tile" | "macbook" | "display" | "stack" | "wall";

/** Everything the camera and the device can do, in one pose. */
export interface Pose {
  /** Camera yaw in degrees; positive looks at the device from its right. */
  yaw: number;
  /** Camera pitch in degrees; positive looks down on the device. */
  pitch: number;
  /** Dolly: 1 is the shot's resting framing. */
  zoom: number;
  /** Camera offset as a percentage of the frame. */
  x: number;
  y: number;
  /** Laptop lid angle in degrees (0 closed, ~110 open). */
  lid: number;
  /** Device lift as a percentage of the frame (positive is below its rest). */
  rise: number;
  /** Tile tilt, 1 = fully tilted, 0 = flat. */
  settle: number;
  /** Tile stack / wall: which item is in front (fractional while moving). */
  index: number;
}

export type PrimitiveKind = "orbit" | "tilt" | "push" | "truck" | "pedestal" | "rise" | "lid" | "settle" | "drift" | "shuffle" | "hold";

export interface MotionPrimitive {
  kind: PrimitiveKind;
  from: number;
  to: number;
  /** Seconds from the start of the shot. */
  at: number;
  /** Seconds. */
  duration: number;
  /** spring: settles with no overshoot. linear: constant, for drifts. */
  curve: "spring" | "linear";
}

export interface Shot {
  id: string;
  set: ShotSet;
  name: string;
  /** One line: what it looks like and when to use it. */
  line: string;
  device: ShotDevice;
  pose: Pose;
  motion: MotionPrimitive[];
  /** Where titles go, if the framing leaves room. */
  openSpace?: "left" | "right";
}

/** What each primitive moves, in words the agent and the UI share. */
export const PRIMITIVES: Record<PrimitiveKind, { label: string; prop: keyof Pose | null; unit: string; describe: string }> = {
  orbit: { label: "Orbit", prop: "yaw", unit: "°", describe: "Camera circles the device" },
  tilt: { label: "Tilt", prop: "pitch", unit: "°", describe: "Camera rises or drops its angle" },
  push: { label: "Push", prop: "zoom", unit: "×", describe: "Camera dollies in or out" },
  truck: { label: "Truck", prop: "x", unit: "%", describe: "Camera slides sideways" },
  pedestal: { label: "Pedestal", prop: "y", unit: "%", describe: "Camera slides up or down" },
  rise: { label: "Rise", prop: "rise", unit: "%", describe: "Device lifts into frame" },
  lid: { label: "Lid", prop: "lid", unit: "°", describe: "Laptop lid opens" },
  settle: { label: "Settle", prop: "settle", unit: "", describe: "Tilted tile settles flat" },
  drift: { label: "Drift", prop: "x", unit: "%", describe: "Slow constant slide" },
  shuffle: { label: "Shuffle", prop: "index", unit: "", describe: "Next card comes forward" },
  hold: { label: "Hold", prop: null, unit: "", describe: "Camera rests while the clip plays" },
};

const REST: Pose = { yaw: 0, pitch: 0, zoom: 1, x: 0, y: 0, lid: 108, rise: 0, settle: 0, index: 0 };
const p = (over: Partial<Pose>): Pose => ({ ...REST, ...over });
const m = (kind: PrimitiveKind, from: number, to: number, at: number, duration: number, curve: "spring" | "linear" = "spring"): MotionPrimitive => ({ kind, from, to, at, duration, curve });

export const SHOTS: Shot[] = [
  /* ── Basics ── */
  { id: "focus", set: "basics", name: "Zoom focus", line: "Browser frame; the camera follows your clicks.", device: "browser", pose: p({}), motion: [m("hold", 0, 0, 0, 1)] },
  { id: "clean", set: "basics", name: "Clean window", line: "Just the window on a backdrop, no chrome.", device: "window", pose: p({}), motion: [m("hold", 0, 0, 0, 1)] },
  { id: "tile", set: "basics", name: "Floating tile", line: "The screen as a tile that settles flat.", device: "tile", pose: p({ settle: 1 }), motion: [m("settle", 1, 0, 0.2, 1.4), m("push", 0.94, 1, 0.2, 1.6)] },
  { id: "desk", set: "basics", name: "Desktop display", line: "Straight-on monitor with a gentle push.", device: "display", pose: p({ zoom: 0.96 }), motion: [m("push", 0.96, 1.04, 0, 6, "linear")] },

  /* ── Director's Cut ── */
  { id: "lid-rise", set: "directors-cut", name: "Lid Rise", line: "The lid opens and the screen powers on. Opener.", device: "macbook",
    pose: p({ yaw: 18, pitch: 14, lid: 0, zoom: 0.92 }), motion: [m("lid", 0, 108, 0.2, 1.6), m("orbit", 18, 12, 1.2, 1.6), m("push", 0.92, 1, 0.2, 2.4)] },
  { id: "orbit-in", set: "directors-cut", name: "Orbit In", line: "Swings from three-quarter to straight-on.", device: "macbook",
    pose: p({ yaw: 34, pitch: 8 }), motion: [m("orbit", 34, 0, 0.1, 2.4), m("tilt", 8, 4, 0.1, 2.4)] },
  { id: "takeover", set: "directors-cut", name: "Screen Takeover", line: "Pushes through the bezel into the UI.", device: "macbook",
    pose: p({ pitch: 4, zoom: 0.8 }), motion: [m("push", 0.8, 2.6, 0.3, 1.8)] },
  { id: "monolith-rise", set: "directors-cut", name: "Monolith Rise", line: "The display rises onto a plinth. Brand opener.", device: "display",
    pose: p({ pitch: -6, rise: 40 }), motion: [m("rise", 40, 0, 0.1, 1.6)] },
  { id: "pan-right", set: "directors-cut", name: "Right Pan", line: "Three-quarter right, title space on the right.", device: "macbook", openSpace: "right",
    pose: p({ yaw: 28, pitch: 6, x: -14 }), motion: [m("truck", -14, -18, 0, 6, "linear")] },
  { id: "pan-left", set: "directors-cut", name: "Left Pan", line: "Mirror of Right Pan, for alternating features.", device: "macbook", openSpace: "left",
    pose: p({ yaw: -28, pitch: 6, x: 14 }), motion: [m("truck", 14, 18, 0, 6, "linear")] },
  { id: "low-hero", set: "directors-cut", name: "Low Hero", line: "Low angle, slow push. Use once per video.", device: "macbook",
    pose: p({ yaw: 12, pitch: -5, zoom: 1.05 }), motion: [m("push", 1.05, 1.14, 0, 6, "linear")] },
  { id: "top-down", set: "directors-cut", name: "Desk Top-Down", line: "Overhead on the desk, slow turn.", device: "macbook",
    pose: p({ pitch: 56, yaw: -6, zoom: 0.92, lid: 124 }), motion: [m("orbit", -6, 6, 0, 6, "linear")] },
  { id: "edge-glide", set: "directors-cut", name: "Edge Glide", line: "Grazing close-up gliding along the screen.", device: "macbook",
    pose: p({ yaw: 52, pitch: 4, zoom: 1.7, x: 10 }), motion: [m("truck", 10, -10, 0, 2.6)] },
  { id: "tile-stack", set: "directors-cut", name: "Tile Stack", line: "Three tiles that shuffle forward in turn.", device: "stack",
    pose: p({ yaw: -10, pitch: 10, settle: 0 }), motion: [m("shuffle", 0, 1, 2.2, 0.45), m("shuffle", 1, 2, 4.4, 0.45)] },
  { id: "wall", set: "directors-cut", name: "Infinite Wall", line: "A wall of screens; one comes forward.", device: "wall",
    pose: p({ pitch: 18, yaw: -8, zoom: 0.9, x: 6 }), motion: [m("drift", 6, -6, 0, 3.2, "linear"), m("push", 0.9, 2.1, 3.2, 1.4)] },
];

export const SHOT_SETS: { value: ShotSet; label: string }[] = [
  { value: "basics", label: "Basics" },
  { value: "directors-cut", label: "Director's Cut" },
];

export function shotById(id: string): Shot {
  return SHOTS.find((s) => s.id === id) ?? SHOTS[0]!;
}

/** Critically damped spring on 0..1: fast start, no overshoot, settles at 1. */
function spring(t: number) {
  const k = 6;
  return (1 - (1 + k * t) * Math.exp(-k * t)) / (1 - (1 + k) * Math.exp(-k));
}

export interface MotionTuning {
  /** 1 = as designed; 0.5 = half speed. */
  speed: number;
  /** 1 = as designed; 0 = no movement; 1.5 = more. */
  amount: number;
}

/** The pose at `t` seconds into the shot. Pure: same inputs, same frame. */
export function poseAt(shot: Shot, t: number, tuning: MotionTuning = { speed: 1, amount: 1 }): Pose {
  const pose = { ...shot.pose };
  const time = t * tuning.speed;
  for (const prim of shot.motion) {
    const prop = PRIMITIVES[prim.kind].prop;
    if (!prop) continue;
    const k = Math.min(1, Math.max(0, (time - prim.at) / prim.duration));
    const eased = prim.curve === "spring" ? spring(k) : k;
    // Amount scales how far each primitive travels, around its end value, so
    // "less movement" keeps the resting framing the same.
    const from = prim.to + (prim.from - prim.to) * tuning.amount;
    if (time >= prim.at || prim === shot.motion.find((q) => PRIMITIVES[q.kind].prop === prop)) {
      pose[prop] = from + (prim.to - from) * eased;
    }
  }
  return pose;
}

/** How long until the camera rests. */
export function shotLength(shot: Shot) {
  return Math.max(...shot.motion.map((m) => m.at + m.duration));
}

/** A template's span when there's no clip to fit: the move, then a beat of rest. */
export function defaultSpan(shot: Shot) {
  return Math.round((shotLength(shot) + 1.5) * 10) / 10;
}

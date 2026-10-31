import type { RecordingSummary } from "@/platform/capture";
import { capture } from "@/platform/capture";
import { DEFAULT_SPRING } from "./model";
import type { Project, RecordingRef, Zoom } from "./model";

/**
 * Turn a finished capture into an editor project.
 *
 * Input tracks are on the session clock; the video starts `videoStartMs` into
 * it. Everything here is converted to video seconds and normalized frame
 * coordinates, which is what the stage and the agent work in.
 */
export function projectFromRecording(summary: RecordingSummary, base: Project): Project {
  const { session } = summary;
  const rect = session.captureRect;
  const duration = Math.max(0.5, session.durationMs / 1000);
  const toVideo = (t: number) => (t - session.videoStartMs) / 1000;
  const norm = (x: number, y: number) => ({ x: (x - rect.x) / rect.width, y: (y - rect.y) / rect.height });
  const inFrame = (p: { x: number; y: number }) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

  const recording: RecordingRef = {
    projectDir: summary.projectDir,
    videoSrc: capture.fileUrl(summary.videoPath),
    width: session.width,
    height: session.height,
    cursor: summary.moves.map((m) => ({ t: toVideo(m.t), ...norm(m.x, m.y) })).filter((m) => m.t >= -0.5),
    clicks: summary.clicks.map((c) => ({ t: toVideo(c.t), ...norm(c.x, c.y) })).filter((c) => c.t >= 0 && inFrame(c)),
  };

  const name = summary.projectDir.split("/").pop()?.replace(/\.spontaneous$/, "") ?? "Recording";
  return {
    ...base,
    revision: base.revision + 1,
    recording,
    name,
    folder: "Recordings",
    duration,
    fps: session.options.fps,
    aspect: "16:9",
    template: "clean",
    motion: { speed: 1, amount: 1 },
    span: { start: 0, length: duration },
    clips: [{ id: "c1", start: 0, end: duration, label: name, speed: 1 }],
    zooms: planAutoZooms(recording.clicks, duration),
    overlays: [],
    notes: [],
    springs: { ...base.springs, screen: DEFAULT_SPRING },
  };
}

/**
 * Placeholder auto-zoom planner until the Rust motion crate lands
 * (docs/ARCHITECTURE.md §5): clicks closer than 2.5s form one zoom, padded so
 * the camera arrives before the click and lingers after it.
 */
export function planAutoZooms(clicks: { t: number; x: number; y: number }[], duration: number): Zoom[] {
  const GAP = 2.5, LEAD = 0.8, TAIL = 2.2;
  const clusters: (typeof clicks)[] = [];
  for (const c of [...clicks].sort((a, b) => a.t - b.t)) {
    const last = clusters.at(-1);
    if (last && c.t - last.at(-1)!.t < GAP) last.push(c);
    else clusters.push([c]);
  }
  const zooms: Zoom[] = [];
  for (const [i, group] of clusters.entries()) {
    const start = Math.max(0, group[0]!.t - LEAD);
    const end = Math.min(duration, group.at(-1)!.t + TAIL);
    if (end - start < 1) continue;
    const xs = group.map((c) => c.x), ys = group.map((c) => c.y);
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const prev = zooms.at(-1);
    if (prev && start - prev.end < 0.6) {
      prev.end = end;
      continue;
    }
    zooms.push({
      id: `auto-${i}`,
      start,
      end,
      scale: spread > 0.35 ? 1.4 : spread > 0.15 ? 1.6 : 1.9,
      target: { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length },
      author: "auto",
    });
  }
  return zooms;
}

/** Cursor position at video time t, linearly interpolated. */
export function cursorAtTime(cursor: RecordingRef["cursor"], t: number) {
  if (!cursor.length) return null;
  let lo = 0, hi = cursor.length - 1;
  if (t <= cursor[0]!.t) return cursor[0]!;
  if (t >= cursor[hi]!.t) return cursor[hi]!;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cursor[mid]!.t <= t) lo = mid; else hi = mid;
  }
  const a = cursor[lo]!, b = cursor[hi]!;
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

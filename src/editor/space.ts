/**
 * Two coordinate spaces on the stage:
 *
 *   canvas     0–1 of the output frame, backdrop included. Notes, ink and pins
 *              are drawn here, so you can mark anywhere in the video.
 *   recording  0–1 of the source recording. Zoom targets, the cursor, clicks
 *              and callouts live here, because they belong to the footage.
 *
 * Where the recording sits on the canvas changes with the shot, the camera
 * and time (a 3D shot tilts it, a zoom scales it), so the stage measures it:
 * four markers at the recording's corners, read back after every transform,
 * give the projected quad, and a homography maps between the two spaces.
 */
import type { Rect } from "./model";

type Pt = [number, number];
/** Corners in order: top left, top right, bottom right, bottom left. */
type Quad = [Pt, Pt, Pt, Pt];
type Mat = [number, number, number, number, number, number, number, number, number];

/** Where the recording is on the canvas right now, in canvas space. */
export interface ScreenMap {
  /** The recording's full frame (it can reach past the canvas when zoomed). */
  recording: Quad;
  /** The device screen it shows through, when that crops it (3D shots). */
  window?: Quad;
}

/** The projective map from the unit square onto a quad (Heckbert). Null when the quad is degenerate. */
function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): Mat | null {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

function invert([a, b, c, d, e, f, g, h, i]: Mat): Mat | null {
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

function apply(m: Mat, [x, y]: Pt): Pt | null {
  const w = m[6] * x + m[7] * y + m[8];
  if (w <= 1e-9) return null;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

const corners = (r: Rect): Pt[] => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

/** The bounding box of points, cut to the unit square. Null when nothing is left. */
function clipBox(pts: Pt[]): Rect | null {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(1, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(1, Math.max(...ys));
  if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Points through a map, or null if any of them can't be mapped (behind the camera, degenerate). */
function through(m: Mat | null, pts: Pt[]): Pt[] | null {
  if (!m) return null;
  const out = pts.map((p) => apply(m, p));
  return out.every(Boolean) ? (out as Pt[]) : null;
}

/**
 * The part of a canvas-space region that lands on the visible recording, in
 * recording space. Undefined when the region is only on the backdrop.
 */
export function canvasToRecording(map: ScreenMap, region: Rect): Rect | undefined {
  let pts: Pt[] | null = corners(region);
  // Cut to the device screen first, so a zoomed recording's hidden edges don't count.
  if (map.window) {
    const toWindow = squareToQuad(map.window);
    const inWindow = clipBox(through(toWindow && invert(toWindow), pts) ?? []);
    if (!inWindow) return undefined;
    pts = through(toWindow, corners(inWindow));
  }
  const toRecording = squareToQuad(map.recording);
  return clipBox(through(toRecording && invert(toRecording), pts ?? []) ?? []) ?? undefined;
}

/**
 * Read a marker set (four children at an element's corners, see `ScreenCorners`)
 * as a quad in the canvas space of `canvas`. Works through 2D and 3D transforms,
 * because each marker's box is measured after projection.
 */
export function measureQuad(markers: Element | null, canvas: Element): Quad | undefined {
  if (!markers || markers.children.length < 4) return undefined;
  const c = canvas.getBoundingClientRect();
  if (!c.width || !c.height) return undefined;
  const pts = Array.from(markers.children).slice(0, 4).map((el) => {
    const r = el.getBoundingClientRect();
    return [(r.left + r.width / 2 - c.left) / c.width, (r.top + r.height / 2 - c.top) / c.height] as Pt;
  });
  return pts as Quad;
}

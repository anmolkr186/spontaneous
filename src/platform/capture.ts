import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { devRecording } from "./dev-recording";
import { isTauri } from "./tauri";

/** Mirrors crates/capture (serde camelCase). */

export type PermissionKind = "screen" | "microphone" | "inputMonitoring" | "accessibility";
export type PermissionState = "granted" | "denied" | "notDetermined";
export type PermissionsStatus = Record<PermissionKind, PermissionState>;

export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplaySource { id: number; name: string; frame: Rect; isMain: boolean }
export interface WindowSource { id: number; z: number; title: string; appName: string; bundleId: string; frame: Rect }
export interface PickedWindow { id: number; appName: string; title: string }
export interface Sources { displays: DisplaySource[]; windows: WindowSource[] }

export type Target =
  | { kind: "display"; displayId: number }
  | { kind: "window"; windowId: number }
  | { kind: "area"; displayId: number; rect: Rect };

export interface RecordOptions { target: Target; fps: number; systemAudio: boolean; microphone: boolean; codec: "h264" | "hevc" }

export interface SessionInfo {
  captureRect: Rect;
  scale: number;
  width: number;
  height: number;
  videoStartMs: number;
  durationMs: number;
  options: RecordOptions;
}
export interface InputMove { t: number; x: number; y: number; c?: string }
/** A control from the Accessibility API. Frame is global points: x, y, width, height. */
export interface AxElement { role: string; label?: string; frame?: [number, number, number, number] }
export interface InputClick { t: number; x: number; y: number; button: string; down: boolean; count: number; target?: AxElement }
export interface CursorImage { id: string; file: string; hotspot: [number, number]; size: [number, number] }
export interface RecordingSummary {
  projectDir: string;
  videoPath: string;
  session: SessionInfo;
  input: {
    eventTap: boolean;
    accessibility: boolean;
    focusChanges: number;
    moves: number;
    clicks: number;
    keys: number;
    cursors: CursorImage[];
  };
  clicks: InputClick[];
  moves: InputMove[];
}

const BROWSER_SOURCES: Sources = {
  displays: [{ id: 1, name: "Main display", frame: { x: 0, y: 0, width: 1512, height: 982 }, isMain: true }],
  windows: [
    { id: 11, z: 0, title: "Projects · Acme", appName: "Safari", bundleId: "com.apple.Safari", frame: { x: 120, y: 80, width: 1280, height: 800 } },
    { id: 12, z: 1, title: "Spontaneous", appName: "Figma", bundleId: "com.figma.Desktop", frame: { x: 60, y: 40, width: 1400, height: 900 } },
    { id: 13, z: 2, title: "Simulator · iPhone 17 Pro", appName: "Simulator", bundleId: "com.apple.iphonesimulator", frame: { x: 900, y: 60, width: 420, height: 880 } },
  ],
};

export const capture = {
  permissions: async (): Promise<PermissionsStatus> =>
    isTauri ? invoke("capture_permissions") : { screen: "granted", microphone: "notDetermined", inputMonitoring: "granted", accessibility: "notDetermined" },
  requestPermission: (kind: PermissionKind) => (isTauri ? invoke<void>("capture_request_permission", { kind }) : Promise.resolve()),
  openSettings: (kind: PermissionKind) => (isTauri ? invoke<void>("capture_open_settings", { kind }) : Promise.resolve()),
  sources: async (): Promise<Sources> => (isTauri ? invoke("capture_sources") : BROWSER_SOURCES),
  start: (name: string, options: RecordOptions) =>
    isTauri ? invoke<string>("capture_start", { args: { name, options } }) : Promise.reject(new Error("Recording needs the desktop app")),
  stop: () => invoke<RecordingSummary>("capture_stop"),
  discard: () => invoke<void>("capture_discard"),
  /**
   * The last finished recording, held by the app so a reload or missed event can't lose it.
   * On localhost the browser build gets a sample from the dev server instead (src/platform/dev-recording.ts).
   */
  lastFinished: () => (isTauri ? invoke<RecordingSummary | null>("capture_last_finished") : import.meta.env.DEV ? devRecording() : Promise.resolve(null)),
  openRecorder: (source: "display" | "window" | "area" = "display") => (isTauri ? invoke<void>("open_recorder_window", { source }) : Promise.resolve()),
  elapsed: () => invoke<number | null>("capture_elapsed"),
  /** Open the full-screen picker over a display: drag an area, or click a window. */
  pick: (mode: "area" | "window", display: Rect) => invoke<void>("capture_pick", { mode, display }),
  areaDone: (rect: Rect | null) => invoke<void>("capture_area_done", { rect }),
  windowDone: (window: PickedWindow | null) => invoke<void>("capture_window_done", { window }),
  onWindowPicked: (fn: (w: PickedWindow | null) => void): Promise<UnlistenFn> =>
    isTauri ? listen<PickedWindow | null>("window-picked", (e) => fn(e.payload)) : Promise.resolve(() => {}),
  onFinished: (fn: (s: RecordingSummary) => void): Promise<UnlistenFn> =>
    isTauri ? listen<RecordingSummary>("recording-finished", (e) => fn(e.payload)) : Promise.resolve(() => {}),
  onAreaPicked: (fn: (r: Rect | null) => void): Promise<UnlistenFn> =>
    isTauri ? listen<Rect | null>("area-picked", (e) => fn(e.payload)) : Promise.resolve(() => {}),
  fileUrl: (path: string) => (isTauri ? convertFileSrc(path) : path),
};

/** "Recording 30 Oct at 16.42" */
export function recordingName(date = new Date()) {
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", ".");
  return `Recording ${day} at ${time}`;
}

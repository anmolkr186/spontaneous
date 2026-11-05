# Spontaneous — architecture

Spontaneous is a local macOS app for recording UI (web and mobile screens), turning the recording into a polished product video, and doing it mostly by annotating the frame and letting an agent apply the edit.

Core loop: **Record → Annotate → Agent applies → Preview → Export**.

This document is the engineering plan. It is based on four studies done on 2026-10-30:

- **Monocode** (source + shipped app via REA): Tauri v2 shell, agent process hosting, window chrome.
- **Recordly** and **Cap** (source): capture, cursor, auto-zoom, render and export pipelines. Both are AGPL-3.0. We study them; we never copy code.
- **Screen Studio 4.1** and **PolyCapture 1.13** (shipped apps via REA, `otool`, `strings`): what the best-in-class recorder actually does.
- **Platform research**: ScreenCaptureKit, VideoToolbox, wgpu, Tauri v2 IPC, Claude Code as a sidecar.

---

## 1. Principles

1. **Record raw, render later.** The recording is a set of immutable, timestamped tracks: screen video with the cursor hidden, cursor images, mouse moves, clicks, keys, focus events, audio. Zoom, cursor smoothing, device frames, backgrounds and annotations are all render-time functions of a small JSON edit list. This is what Screen Studio does and is the single most important decision.
2. **Rust owns pixels; the webview owns chrome.** Video frames never cross into JavaScript. Capture, encode, decode, compositing and export are Rust. React draws panels, the timeline and the chat. (Cap's Tauri app streamed frames to a canvas over a WebSocket and hit a wall. Screen Studio avoids it with Chromium IOSurface import, which WKWebView cannot do.)
3. **One renderer.** Preview and export call the same pure function `render(project, t) -> frame`. Export is offline, fixed-step, faster than real time, and bit-identical to the preview.
4. **Agents edit through typed tools, never through files.** The agent sees an MCP server with tools like `add_zoom` and `add_callout`. Each call is validated, applied as an undoable command, and reflected live.
5. **Annotations are the main way to edit.** Draw on the frame, speak, or type: the note is anchored to a time and a region, and the agent turns it into edits. Manual controls exist for precision, not as the primary path.
6. **Local first.** No database server, no account. A project is a folder on disk.

---

## 2. System overview

```
┌──────────────────────────── Spontaneous.app (one process) ───────────────────────────┐
│                                                                                       │
│  NSWindow                                                                             │
│  ├─ CAMetalLayer  ◄── wgpu compositor (preview)          ◄── decode (VideoToolbox)   │
│  └─ WKWebView (transparent) — React UI                                                │
│        top bar · canvas hole · inspector · timeline · agent thread                    │
│                                                                                       │
│  Rust core (tokio)                                                                    │
│  ├─ capture     ScreenCaptureKit · AVAssetWriter (fMP4) · CGEventTap · cursor atlas   │
│  ├─ project     .spontaneous package · schema · command log · undo · autosave        │
│  ├─ motion      springs · auto-zoom planner · cursor smoothing                        │
│  ├─ render      wgpu (Metal) scene graph · shaders · templates                       │
│  ├─ export      offline render → VideoToolbox H.264/HEVC/ProRes · GIF                 │
│  ├─ agent       Claude Code CLI child process (stream-json) · output batcher          │
│  └─ mcp         rmcp server: typed editing tools over the project                     │
│                                                                                       │
│  Secondary windows: recording HUD (NSPanel) · area picker overlay (per display)        │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲ Tauri commands (request/response)
        ▲ tauri::ipc::Channel (ordered streams: agent tokens, meters, export progress)
        ▲ async URI protocol spontaneous:// (binary: thumbnails, filmstrips, waveforms)
```

### IPC rules

| Data | Transport | Why |
|---|---|---|
| Commands (start recording, apply edit) | `invoke` | Typed request/response |
| Agent output, level meters, export progress | `tauri::ipc::Channel` | Ordered, low overhead. Tauri events are documented as not for high throughput |
| Thumbnails, filmstrip tiles, waveforms | `register_asynchronous_uri_scheme_protocol` (`spontaneous://`) | Binary, cacheable, no base64 |
| Project state changes | Channel carrying JSON patches + `revision` | UI mirrors Rust, never the other way |
| Video frames | **Never** | Rendered natively under the webview |

Coalesce agent output in Rust at 16 ms and flush in the UI on `requestAnimationFrame`, slowing to 250 ms when the panel is hidden (the Monocode pattern).

---

## 3. Capture engine (`crates/capture`)

| Concern | Choice |
|---|---|
| Screen | `screencapturekit` 11.x (`macos_15_0`, `async`) in-process. Display, window (real window filter), or area (`sourceRect`). 60 fps default, 120 on ProMotion, capped at the display refresh |
| Picker | `SCContentSharingPicker` for display/window; our own overlay window for area |
| Cursor in video | `showsCursor = false`. The cursor is re-rendered |
| Own windows | Excluded via the content filter, so the HUD and overlays never appear |
| Pixel format | NV12 `420v` (8-bit sRGB/P3). Optional 10-bit HDR later |
| Encoder | `AVAssetWriter` + VideoToolbox H.264, fragmented MP4 with ~2 s fragments, 1 s keyframes. Crash-safe and instantly seekable |
| Audio | System audio via SCStream. Mic via SCStream `captureMicrophone` (macOS 15). Separate `.m4a` tracks |
| Camera | AVCaptureSession to its own file (phase 3) |
| Clock | Mach host time for every track |
| Screenshots | `SCScreenshotManager` (rect on 15.2+, HDR on 26) |

### Input tracks

- **Events:** listen-only `CGEventTap` for clicks, scrolls and keys (needs Input Monitoring), host-time stamped.
- **Position:** sampled at 120 Hz on its own thread. Sampling at 30–60 Hz is too coarse; that is a known weakness of both Recordly and Cap.
- **Cursor shapes:** `NSCursor.currentSystemCursor` images, hashed and deduplicated into a cursor atlas (PNG + hotspot). Each move references a `cursor_id`. We also derive a semantic type (arrow / pointer / text) so cursor sets can be swapped.
- **Focus:** AXUIElement focus changes (text field focused, menu opened), used by the zoom planner.
- **Writing:** streaming JSON-lines, flushed incrementally so a crash keeps everything up to the last second.

### Permissions

Screen Recording, Microphone, Accessibility, Input Monitoring. An onboarding checklist checks each one (`CGPreflightScreenCaptureAccess`, `CGPreflightListenEventAccess`, …) and deep-links to System Settings. The app is **not sandboxed** (event taps and AX need that), signed with a Developer ID and the hardened runtime.

---

## 4. Project package (`crates/project`)

A project is a `.spontaneous` folder (a package on macOS):

```
Launch video.spontaneous/
  meta.json                 { format: 1, app_version, created_at }
  project.json              the edit list (below), written atomically
  history.jsonl             append-only command log (undo/redo, agent audit)
  annotations.json          notes: anchor, ink, voice, status
  recording/
    session.json            sources, displays, scale factors, clock origin
    screen/  init.mp4  seg-0001.m4s …
    audio/   system.m4a  mic.m4a
    input/   moves.jsonl  clicks.jsonl  keys.jsonl  focus.jsonl
    cursors/ atlas.json  c-<hash>.png …
  cache/                    thumbnails, filmstrip, waveform (safe to delete)
  exports/
```

`project.json` (Rust types; TypeScript is generated with `specta`):

```ts
Project {
  revision: number
  canvas: { aspect: "16:9"|"9:16"|"1:1"|"4:5"|custom, size, fps }
  template: TemplateRef              // device frame or scene preset
  background: Gradient | Image | Blur | Solid
  frame: { padding, radius, shadow, inset }
  cursor: { set, size, smoothing: Spring, hideWhenIdle, clickEffect }
  springs: { screen: Spring, cursor: Spring, click: Spring }
  motionBlur: { screen, cursor, zoom }
  clips: Clip[]                       // source in/out, speed, mute
  zooms: Zoom[]                       // start, end, scale, target: Auto | Point | Rect, glide
  overlays: Overlay[]                 // callout, arrow, highlight, blur, text, keystroke, spotlight
  captions: Caption[]
  audio: { system, mic, music, ducking }
}
Spring { stiffness, damping, mass }
```

Every mutation is a `Command { id, author: "user"|"agent", base_revision, op, inverse }`. That gives undo/redo, the agent audit trail, and optimistic concurrency between the agent and the user.

---

## 5. Motion engine (`crates/motion`)

- **Springs everywhere.** Use analytic spring-mass-damper channels for zoom amount, zoom centre, cursor position and click pulse. Retarget at 8 ms and carry velocity across retargets. With no fixed durations, overlapping zooms need no special cases (Cap's best idea).
- **Deterministic timeline.** Precompute camera and cursor curves lazily per edit and sample them by time. Seeking, preview and export produce identical frames.
- **Auto-zoom planner.**
  1. Collect candidates from clicks, focus changes, typing bursts and dwell.
  2. Classify intent from the post-click trajectory: dropdown, text selection, field focus, double-click (Recordly's best idea).
  3. Cluster nearby events into spans and choose a target rect and scale per span.
  4. Merge spans that are close, turning them into pans.
  5. Emit them as normal `Zoom` items marked `source: "auto"`, so the agent and the user edit them like any other zoom.
- **Cursor.** Smooth with a spring, anticipate clicks, suppress shake, hide when idle, motion-blur in proportion to velocity.
- **Motion blur.** Directional for pans, radial for zooms, done in shaders.

---

## 6. Render and export (`crates/render`, `crates/export`)

- **Compositor.** wgpu 30 on Metal. Passes: background → device or template frame → screen (rounded, shadowed, transformed by the camera) → cursor → overlays and annotations → captions.
- **Decode.** `AVAssetReader` / `VTDecompressionSession` into IOSurface-backed `CVPixelBuffer`s, imported zero-copy as Metal textures. Keep a decode-ahead ring of about 6 frames and a cache of about 36 (Screen Studio's numbers).
- **Preview.** wgpu renders into a `CAMetalLayer` behind the transparent WKWebView. React reserves a "canvas hole" element and reports its rect through `invoke("set_viewport_rect")` on every layout change, and Rust sets the layer frame. On-canvas UI such as annotation ink, selection handles and callout editing is drawn by React in the webview above the layer, in the same coordinates.
- **Fallback (phase 1 only).** Until the native layer lands, the canvas hole plays the source with `<video>` over `spontaneous://` (Range support) and a WebGL approximation of the zoom. It is only for building UI; never ship it as the renderer.
- **Export.** Offline fixed-step render → NV12 IOSurface → VideoToolbox (H.264 or HEVC; ProRes 422 on request) → MP4/MOV. GIF uses a palette pass. Export runs in a worker process (`spontaneous --export-worker`) so a crash cannot take down the editor. Two fast paths:
  - **Static fast path:** segments with no camera motion skip compositing changes.
  - **Turbo:** chunked parallel encode.

---

## 7. Agent and annotations (`crates/agent`, `crates/mcp`)

### Annotation model

```ts
Annotation {
  id, at: { start, end? },           // time anchor
  region?: Rect | Path,              // where on the frame
  ink?: Stroke[],                    // pen strokes, normalized coords
  voice?: { file, transcript },      // whisper.cpp / Apple Speech, local
  text?: string,
  intent?: "zoom"|"blur"|"callout"|"speed"|"cut"|"style"|"other",
  status: "open" | "applying" | "applied" | "dismissed",
  resolvedBy?: CommandId[]           // which edits answered this note
}
```

Notes look like Flask's time-coded feedback: a pin on the timeline and a card in the thread. When a note is resolved, its card links to the exact edits, and those edits can be reverted together.

### Agent host

- Spawn the user's own `claude` CLI, as Monocode does:
  ```
  claude -p --input-format stream-json --output-format stream-json --verbose
         --include-partial-messages --permission-prompt-tool stdio
         --mcp-config <app>/mcp.json --allowedTools "mcp__spontaneous__*"
  ```
  This disables the built-in file and shell tools, so the agent can only act through our tools.
- Find the CLI using the login shell's `PATH` (apps launched from Finder don't inherit it). Reap orphaned agent processes on start, and escalate SIGHUP → SIGKILL on quit.
- Stream stdout through a 16 ms batcher into a Channel.

### MCP tools (rmcp 3.x, served in-process)

| Read | Write (undoable commands) |
|---|---|
| `get_project`, `get_annotations`, `get_timeline_summary` | `add_zoom`, `update_zoom`, `remove_zoom` |
| `get_input_events(range)` (clicks, focus, typing) | `add_overlay` (callout, arrow, highlight, blur, text, spotlight) |
| `render_frame(t)` returns a PNG, so the agent can see the frame | `set_speed`, `cut`, `trim`, `set_template`, `set_background`, `set_cursor` |
| `list_templates` | `resolve_annotation(id, commands)`, `ask_user(question, options)` |

### Chat UI

- The thread renders from an external store: Rust owns the thread state and React only renders it. The chat runtime is imported in one adapter (`src/ui/organisms/agent/runtime.ts`), so it can be swapped without touching components.
- Message parts: text, collapsed reasoning, a card per tool call (edits get Undo), and `ask_user` and permission prompts as inline choice cards that answer the CLI over stdin.
- Suggestions are driven by open notes ("Apply 3 open notes").
- Which component renders which moment of a run (stream event, tool call or app state), with sample agent text for each: `docs/AGENT_UI.md`, generated from `src/ui/agent-ui/catalog.ts`. It also lists the UI tools the MCP server should add (`propose_plan`, `propose_text_edit`, `request_permission`, `try_variants`, `suggest_shot`, `answer_with_moments`, `reply_to_note`).

---

## 8. UI architecture

- **Stack:** React 19, Vite 8, TypeScript, zustand for UI state (the project mirror is read-only), Motion for React, CSS modules.
- **Design system** (`src/ui`, documented at `/docs.html`):
  - `tokens/`: color (graphite ramp from the mark, plus ink and rec), space (4px grid), concentric radii, materials (panel, key, face, well, dock), type (Geist; Geist Mono only for time) and motion.
  - `base/`: behavior-heavy controls (slider, switch, scrub input, tooltip), styled only through tokens.
  - `atoms/`: Mark, Key, IconKey, Kbd, Label, Timecode, Tag, Cell, Meter.
  - `molecules/`: Panel, Group, Field, Switcher, SourceKey, ToggleKey, NoteCard, TemplateCard, SwatchPicker.
  - `organisms/`: docks (annotation, recorder), stage, timeline, agent thread.
- **Docs:** a second Vite entry (`docs.html`) with foundations pages and a page per component (preview, source, props, what it's built from, notes for agents). It runs in a plain browser with Tauri mocked.
- **Window chrome:** overlay title bar with traffic lights, a boot splash, and the theme applied before the bundle loads.
- **Secondary windows:** separate Vite entries so they boot instantly: the recorder dock and the area picker.

### Recording flow

1. The menu bar item (the S glyph, as a template image) offers Record display, Record a window…, Record an area….
2. Each opens the recorder dock: a floating, always-on-top window, bottom centre of the main display. It shows source keys, microphone and system-audio toggles, and a Record key. Choosing a window shows a list above the dock; choosing an area opens the full-screen picker.
3. While recording, the same dock shows the clock, a mic level, Discard and Stop. Spontaneous's own windows are excluded from the capture.
4. Stop closes the dock and opens the editor on the new recording.

### Editor modes

- **Lite** (default): stage, annotation dock, notes and agent panel, and a single scrub bar with note pins. Most editing happens by leaving notes.
- **Studio**: adds the inspector (shot, style, cursor, motion) and the full multi-track timeline. Switch with the control at the top, or ⌘1 / ⌘2.

### Editor layout

```
┌ ● ● ●  [mark] Folder / Launch video ▾             [ Lite | Studio ]     ↶ ↷  Export ┐
├──────┬─────────────────────────────────────────────────────────┬────────────────────┤
│Tmpl  │                                                         │  Notes · Agent      │
│Style │             canvas (native layer)                       │  ┌───────────────┐ │
│Cursor│             + annotation ink layer                      │  │ note 0:12  ✎  │ │
│Zoom  │                                                         │  │ "zoom on CTA" │ │
│Audio │                                                         │  └───────────────┘ │
│      │      ╭ 🎙  ▢  ✎  Leave a note…            → ╮           │  agent thread      │
│      │      ╰─────────────────────────────────────╯           │  … tool cards       │
├──────┴─────────────────────────────────────────────────────────┤  composer          │
│ ▶ 0:12 / 1:30   timeline: clips · zooms · overlays · notes · audio                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

There is one mode. The floating annotation dock (mic · frame · pen · text, after Flask) is always there. The agent thread lives on the right and turns notes into edits.

---

## 9. Templates (prefab shots)

A template is data in a Rust-side registry (`templates/*.json` plus assets) and needs no code. It defines canvas aspect, background, device frame, screen placement and default springs. Starter set:

| Family | Templates |
|---|---|
| Web | Browser (Safari-style), Browser minimal, Floating window, Window + shadow on gradient, Split (two windows) |
| Mobile | iPhone 17 Pro, iPhone in hand (static), Android generic, Phone + desktop pair |
| Social | 9:16 vertical with title band, 1:1 square card, 4:5 feed |
| Launch | Hero title → product reveal, Feature trio (three clips), Changelog card, Before / after |
| Stills | Screenshot on gradient, Device mockup still, Multi-screenshot collage |

The agent can choose and parameterize templates through `set_template`.

---

## 10. Features

### v1 core

1. Record a display, window or area at 60/120 fps, with system audio and mic, crash-safe.
2. Screenshot a display, window or area straight into a template.
3. Hidden cursor, re-rendered with smoothing, size and hide-when-idle.
4. Auto-zoom from clicks, focus and typing, using spring motion.
5. Backgrounds (gradient, image, blur), padding, radius, shadow.
6. Templates for web and mobile.
7. Annotations: pen ink, text, voice notes on the frame, pinned to time.
8. Agent panel: notes → typed edits, with tool cards and per-edit undo.
9. Timeline: trim, cut, speed, zoom and overlay tracks, note pins.
10. Export: MP4 (H.264/HEVC), GIF, PNG stills. Presets for 16:9, 9:16 and 1:1.

### Extended

- **Launch composer:** the agent builds a 20–45 s launch cut from several recordings plus title cards, with beats synced to music.
- Captions from local transcription (whisper.cpp), styled per template.
- Keystroke overlay and shortcut callouts.
- Sensitive-data blur: Vision OCR finds emails and keys, and the agent proposes blur overlays.
- Webcam bubble with background cutout (CoreML person matte).
- Voiceover recording against the timeline; speech enhancement.
- iPhone recording over USB (CoreMediaIO).
- Versions and compare (v1 / v2 side by side, Flask-style), all local.
- Brand kit: logo, colors and fonts applied by every template.
- Command palette (⌘K) and a full keyboard-driven timeline.
- HDR / P3 capture and ProRes export.
- Export the agent's session as `CHANGES.md` next to the video, like Flask's "code and files".

---

## 11. Repository layout

```
spontaneous/
  brand/                     mark SVG, icon sources
  docs/                      ARCHITECTURE.md, decisions/
  src/                       React app (main editor entry)
    app/                     shell, routes, stores
    features/                editor, timeline, inspector, annotations, agent, recorder, templates
    ui/                      design system: tokens, base, atoms, molecules, organisms
    platform/                tauri wrappers + browser mocks
  docs-site/                 component docs (second Vite entry)
  hud/  picker/              secondary window entries
  src-tauri/                 Tauri app crate (commands, windows, macOS chrome)
  crates/
    capture/ project/ motion/ render/ export/ agent/ mcp/ templates/
```

---

## 12. Roadmap

| Phase | Outcome |
|---|---|
| **1 — Workbench (now)** | Tauri v2 shell, window chrome, Spontaneous UI library + docs site, editor layout with mocked project data, agent thread rendering mocked stream-json. |
| 2 — Capture (done) | `crates/capture`: ScreenCaptureKit display/window/area recording, input tracks, cursor atlas, permissions; menu bar item, recorder dock, area picker; recordings open in the editor. Video is written with `SCRecordingOutput` for now; the fragmented-MP4 AVAssetWriter path is a follow-up. |
| 3 — Renderer | wgpu compositor in a CAMetalLayer under the webview, decode ring, springs, auto-zoom planner, templates v1. |
| 4 — Agent | Claude Code sidecar, rmcp tools, annotation → command flow, undo, `render_frame`. |
| 5 — Export | Offline render → VideoToolbox, GIF, presets, worker process. |
| 6 — Extended | Launch composer, captions, blur, webcam, versions. |

---

## 13. Risks and open questions

Product and design decisions (open, decided, and decided-but-not-built) are tracked in `docs/DECISIONS.md`. This section keeps the technical risks.

- **Native layer under WKWebView.** We need to confirm that resize, Retina scale and live-resize sync are smooth. If not, fall back to a separate child NSWindow or a native canvas view next to the webview. Prototype this first in phase 3.
- **AGPL references.** Recordly and Cap are reference only. Don't copy code.
- **Permissions UX on macOS 15+.** Screen Recording consent is re-confirmed periodically, and the onboarding has to handle that gracefully.
- **Claude Code CLI coupling.** stream-json is stable but versioned, so pin a minimum CLI version and detect it on start.

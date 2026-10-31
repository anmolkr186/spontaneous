//! Tauri commands around the capture crate, plus the two secondary windows a
//! recording needs: the floating recorder dock and the area picker.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Deserialize;
use spontaneous_capture::{PermissionKind, PermissionsStatus, Rect, RecordOptions, Recording, RecordingSummary, Sources};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

#[derive(Default)]
pub struct CaptureState {
  recording: Mutex<Option<Recording>>,
  /// The last finished recording. The editor asks for it on load and focus, so
  /// a reload or a missed event never leaves it on an empty project.
  finished: Mutex<Option<RecordingSummary>>,
}

/// Where new projects go: ~/Movies/Spontaneous.
fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
  app.path().video_dir().map(|d| d.join("Spontaneous")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn capture_permissions() -> PermissionsStatus {
  spontaneous_capture::permissions::status()
}

#[tauri::command]
pub fn capture_request_permission(kind: PermissionKind) {
  spontaneous_capture::permissions::request(kind);
}

#[tauri::command]
pub fn capture_open_settings(kind: PermissionKind) {
  spontaneous_capture::permissions::open_settings(kind);
}

#[tauri::command]
pub async fn capture_sources() -> Result<Sources, String> {
  tauri::async_runtime::spawn_blocking(spontaneous_capture::sources::list)
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartArgs {
  name: String,
  options: RecordOptions,
}

#[tauri::command]
pub async fn capture_start(app: AppHandle, state: State<'_, CaptureState>, args: StartArgs) -> Result<String, String> {
  if state.recording.lock().unwrap().is_some() {
    return Err("A recording is already running".into());
  }
  if spontaneous_capture::permissions::status().screen != spontaneous_capture::PermissionState::Granted {
    spontaneous_capture::permissions::request(PermissionKind::Screen);
    return Err("Spontaneous needs Screen Recording permission. Allow it in System Settings, then try again.".into());
  }
  let root = projects_root(&app)?;
  let dir = spontaneous_capture::create_package(&root, &sanitize(&args.name)).map_err(|e| e.to_string())?;

  // Hide the editor so it isn't covering what's being recorded (it is also
  // excluded from the capture filter, so it never appears in the video).
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.hide();
  }
  let options = args.options;
  let project = dir.clone();
  let result = tauri::async_runtime::spawn_blocking(move || Recording::start(&project, options)).await.map_err(|e| e.to_string())?;
  let recording = match result {
    Ok(r) => r,
    Err(err) => {
      let _ = std::fs::remove_dir_all(&dir);
      return Err(err.to_string());
    }
  };
  *state.recording.lock().unwrap() = Some(recording);
  let _ = app.emit("recording-started", dir.to_string_lossy());
  Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn capture_stop(app: AppHandle, state: State<'_, CaptureState>) -> Result<RecordingSummary, String> {
  let recording = state.recording.lock().unwrap().take().ok_or("No recording is running")?;
  let summary = tauri::async_runtime::spawn_blocking(move || recording.stop()).await.map_err(|e| e.to_string())?;
  let summary = summary.map_err(|e| e.to_string())?;
  *state.finished.lock().unwrap() = Some(summary.clone());
  let _ = app.emit_to("main", "recording-finished", &summary);
  if let Some(recorder) = app.get_webview_window(RECORDER) {
    let _ = recorder.close();
  }
  show_editor(&app);
  Ok(summary)
}

/// Stop and throw the recording away.
#[tauri::command]
pub async fn capture_discard(app: AppHandle, state: State<'_, CaptureState>) -> Result<(), String> {
  let recording = state.recording.lock().unwrap().take().ok_or("No recording is running")?;
  let summary = tauri::async_runtime::spawn_blocking(move || recording.stop()).await.map_err(|e| e.to_string())?;
  if let Ok(summary) = summary {
    let _ = std::fs::remove_dir_all(&summary.project_dir);
  }
  if let Some(recorder) = app.get_webview_window(RECORDER) {
    let _ = recorder.close();
  }
  Ok(())
}

/// The last finished recording, if any.
#[tauri::command]
pub fn capture_last_finished(state: State<'_, CaptureState>) -> Option<RecordingSummary> {
  state.finished.lock().unwrap().clone()
}

/// Bring the editor to the front, activating the app first: the recorder dock
/// never activates it, so without this the editor can open behind other apps.
pub fn show_editor(app: &AppHandle) {
  #[cfg(target_os = "macos")]
  let _ = app.show();
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
  }
}

#[tauri::command]
pub fn capture_elapsed(state: State<'_, CaptureState>) -> Option<f64> {
  state.recording.lock().unwrap().as_ref().map(Recording::elapsed)
}

/* ───────────────────────── Pickers ───────────────────────── */

/// Open a transparent overlay over the display for choosing an area or a
/// window. The page reports back with `capture_area_done` / `capture_window_done`.
#[tauri::command]
pub async fn capture_pick(app: AppHandle, mode: String, display: Rect) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window(PICKER) {
    let _ = existing.close();
  }
  if let Some(recorder) = app.get_webview_window(RECORDER) {
    let _ = recorder.hide();
  }
  let mode = if mode == "window" { "window" } else { "area" };
  let url = format!("picker.html?mode={mode}&x={}&y={}&w={}&h={}", display.x, display.y, display.width, display.height);
  let picker = WebviewWindowBuilder::new(&app, PICKER, WebviewUrl::App(url.into()))
    .title(if mode == "window" { "Select a window" } else { "Select an area" })
    .position(display.x, display.y)
    .inner_size(display.width, display.height)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .accept_first_mouse(true)
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;
  #[cfg(target_os = "macos")]
  let _ = app.show();
  let _ = picker.set_focus();
  register_picker_keys(&app);
  Ok(())
}

/* Picker keys are global while the picker is open, so they work in one press
   even after Cmd-Tab hands focus to another app. Released when it closes. */

const PICKER_KEYS: [(Option<Modifiers>, Code, &str); 8] = [
  (None, Code::Escape, "escape"),
  (None, Code::Enter, "enter"),
  (None, Code::Tab, "next"),
  (Some(Modifiers::SHIFT), Code::Tab, "prev"),
  (None, Code::ArrowDown, "next"),
  (None, Code::ArrowRight, "next"),
  (None, Code::ArrowUp, "prev"),
  (None, Code::ArrowLeft, "prev"),
];

fn register_picker_keys(app: &AppHandle) {
  for (mods, code, _) in PICKER_KEYS {
    if let Err(err) = app.global_shortcut().register(Shortcut::new(mods, code)) {
      log::warn!("picker key {code:?} unavailable: {err}");
    }
  }
}

fn unregister_picker_keys(app: &AppHandle) {
  let _ = app.global_shortcut().unregister_multiple(PICKER_KEYS.iter().map(|(m, c, _)| Shortcut::new(*m, *c)));
}

/// Global shortcut handler: forward picker keys to the picker page.
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
  if event.state() != ShortcutState::Pressed {
    return;
  }
  let Some((_, _, name)) = PICKER_KEYS.iter().find(|(m, c, _)| Shortcut::new(*m, *c) == *shortcut) else { return };
  let _ = app.emit_to(PICKER, "picker-key", *name);
}

const PICKER: &str = "picker";

fn close_picker(app: &AppHandle) {
  unregister_picker_keys(app);
  if let Some(picker) = app.get_webview_window(PICKER) {
    let _ = picker.close();
  }
  if let Some(recorder) = app.get_webview_window(RECORDER) {
    let _ = recorder.show();
    let _ = recorder.set_focus();
  }
}

#[tauri::command]
pub fn capture_area_done(app: AppHandle, rect: Option<Rect>) {
  close_picker(&app);
  let _ = app.emit("area-picked", rect);
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PickedWindow {
  id: u32,
  app_name: String,
  title: String,
}

#[tauri::command]
pub fn capture_window_done(app: AppHandle, window: Option<PickedWindow>) {
  close_picker(&app);
  let _ = app.emit("window-picked", window);
}

/* ───────────────────────── Recorder window ───────────────────────── */

pub const RECORDER: &str = "recorder";
const RECORDER_SIZE: (f64, f64) = (720.0, 72.0);
/// Large enough for the icon to zoom well past its size before it dissolves (matches `.intro` in the recorder).
const INTRO_SIZE: (f64, f64) = (880.0, 880.0);
/// Gap between the dock window and the bottom of the screen.
const DOCK_BOTTOM: f64 = 96.0;

/// Open (or refocus) the floating recorder dock, bottom-centre of the main
/// display. `source` preselects Display, Window or Area.
pub fn open_recorder(app: &AppHandle, source: &str) -> tauri::Result<()> {
  if let Some(existing) = app.get_webview_window(RECORDER) {
    let _ = existing.emit("recorder-source", source);
    existing.show()?;
    existing.set_focus()?;
    return Ok(());
  }
  // The launch intro plays in the middle of the screen; the page then moves
  // the window down to the dock position as the dock appears.
  let intro = source.contains("intro=1");
  let size = if intro { INTRO_SIZE } else { RECORDER_SIZE };
  let (x, y) = app
    .primary_monitor()
    .ok()
    .flatten()
    .map(|m| {
      let scale = m.scale_factor();
      let (w, h) = (m.size().width as f64 / scale, m.size().height as f64 / scale);
      let y = if intro { (h - size.1) / 2.0 } else { h - size.1 - DOCK_BOTTOM };
      (m.position().x as f64 / scale + (w - size.0) / 2.0, m.position().y as f64 / scale + y)
    })
    .unwrap_or((360.0, 760.0));
  WebviewWindowBuilder::new(app, RECORDER, WebviewUrl::App(format!("recorder.html?source={source}").into()))
    .title("Record")
    .position(x, y)
    .inner_size(size.0, size.1)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .accept_first_mouse(true)
    .focused(true)
    .build()?;
  Ok(())
}

#[tauri::command]
pub fn open_recorder_window(app: AppHandle, source: Option<String>) -> Result<(), String> {
  open_recorder(&app, source.as_deref().unwrap_or("display")).map_err(|e| e.to_string())
}

fn sanitize(name: &str) -> String {
  let cleaned: String = name.chars().map(|c| if matches!(c, '/' | ':' | '\\') { '-' } else { c }).collect();
  let trimmed = cleaned.trim();
  if trimmed.is_empty() { "Recording".into() } else { trimmed.chars().take(80).collect() }
}

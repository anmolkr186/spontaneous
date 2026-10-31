//! A recording session: one SCStream writing hardware-encoded video (plus
//! system audio and mic) to disk, with the input tracks running beside it.
//!
//! Layout written into the project package:
//!
//! ```text
//! <name>.spontaneous/
//!   meta.json
//!   recording/
//!     session.json       sources, capture rect, scale, clock offsets
//!     screen.mp4         SCRecordingOutput (H.264/HEVC via VideoToolbox)
//!     input/             moves, clicks, keys, scrolls (.jsonl)
//!     cursors/           atlas.json + c<n>.png
//! ```
//!
//! Phase 2 writes the video with `SCRecordingOutput` (macOS 15). The
//! architecture's fragmented-MP4 AVAssetWriter path, which survives a crash
//! mid-recording, replaces it in a later pass; the session format stays the same.

use screencapturekit::prelude::*;
use screencapturekit::recording_output::{
  RecordingCallbacks, SCRecordingOutput, SCRecordingOutputCodec, SCRecordingOutputConfiguration, SCRecordingOutputFileType,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use crate::clock::{SessionClock, now_ns};
use crate::input::{Click, InputRecorder, InputSummary, Move, read_jsonl};
use crate::sources::Rect;
use crate::CaptureError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Target {
  Display { display_id: u32 },
  Window { window_id: u32 },
  /// A rectangle on a display, in global points.
  Area { display_id: u32, rect: Rect },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Codec {
  #[default]
  H264,
  Hevc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordOptions {
  pub target: Target,
  #[serde(default = "default_fps")]
  pub fps: u32,
  #[serde(default)]
  pub system_audio: bool,
  #[serde(default)]
  pub microphone: bool,
  #[serde(default)]
  pub codec: Codec,
}

fn default_fps() -> u32 {
  60
}

/// Written to `recording/session.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
  pub format: u32,
  pub options: RecordOptions,
  /// What the video frame shows, in global display points.
  pub capture_rect: Rect,
  /// Pixels per point of the captured content.
  pub scale: f64,
  pub width: u32,
  pub height: u32,
  /// Session-clock milliseconds at which the first video frame was written.
  pub video_start_ms: f64,
  pub duration_ms: f64,
  pub started_at_unix_ms: u128,
}

/// Returned to the app when a recording stops.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSummary {
  pub project_dir: PathBuf,
  pub video_path: PathBuf,
  pub session: SessionInfo,
  pub input: InputSummary,
  /// Mouse-down clicks, for the editor's auto-zoom pass.
  pub clicks: Vec<Click>,
  /// Moves decimated to ~30 Hz, for the phase 2 cursor preview.
  pub moves: Vec<Move>,
}

pub struct Recording {
  stream: SCStream,
  output: SCRecordingOutput,
  input: Option<InputRecorder>,
  clock: SessionClock,
  started: Arc<AtomicU64>,
  finished: mpsc::Receiver<Result<(), String>>,
  dir: PathBuf,
  info: SessionInfo,
}

// SCStream and SCRecordingOutput are thread-safe Objective-C objects; the app
// keeps the recording behind a Mutex and only touches it from commands.
unsafe impl Send for Recording {}

/// Create `<root>/<name>.spontaneous`, never overwriting an existing package.
pub fn create_package(root: &Path, name: &str) -> std::io::Result<PathBuf> {
  std::fs::create_dir_all(root)?;
  let mut dir = root.join(format!("{name}.spontaneous"));
  let mut n = 2;
  while dir.exists() {
    dir = root.join(format!("{name} {n}.spontaneous"));
    n += 1;
  }
  std::fs::create_dir_all(dir.join("recording/input"))?;
  std::fs::create_dir_all(dir.join("recording/cursors"))?;
  std::fs::create_dir_all(dir.join("cache"))?;
  std::fs::create_dir_all(dir.join("exports"))?;
  let meta = serde_json::json!({ "format": 1, "app": "Spontaneous", "appVersion": env!("CARGO_PKG_VERSION") });
  std::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
  Ok(dir)
}

impl Recording {
  pub fn start(project_dir: &Path, options: RecordOptions) -> Result<Self, CaptureError> {
    if !crate::permissions::screen_granted() {
      return Err(CaptureError::NotPermitted);
    }
    let content = SCShareableContent::get().map_err(|e| CaptureError::Content(e.to_string()))?;
    let own_pid = std::process::id() as i32;
    let own_apps: Vec<SCRunningApplication> = content.applications().into_iter().filter(|a| a.process_id() == own_pid).collect();
    let own_refs: Vec<&SCRunningApplication> = own_apps.iter().collect();

    let find_display = |id: u32| content.displays().into_iter().find(|d| d.display_id() == id).ok_or(CaptureError::SourceGone);

    // Filter + the rect (global points) the frame will show.
    let (filter, capture_rect, source_rect) = match &options.target {
      Target::Display { display_id } => {
        let display = find_display(*display_id)?;
        let filter = SCContentFilter::create().with_display(&display).with_excluding_applications(&own_refs, &[]).build()?;
        (filter, Rect::from(display.frame()), None)
      }
      Target::Window { window_id } => {
        let window = content.windows().into_iter().find(|w| w.window_id() == *window_id).ok_or(CaptureError::SourceGone)?;
        let filter = SCContentFilter::create().with_window(&window).build()?;
        (filter, Rect::from(window.frame()), None)
      }
      Target::Area { display_id, rect } => {
        let display = find_display(*display_id)?;
        let frame = Rect::from(display.frame());
        let filter = SCContentFilter::create().with_display(&display).with_excluding_applications(&own_refs, &[]).build()?;
        // sourceRect is relative to the display, in points.
        let local = CGRect::new(rect.x - frame.x, rect.y - frame.y, rect.width, rect.height);
        (filter, *rect, Some(local))
      }
    };

    let scale = f64::from(filter.point_pixel_scale()).max(1.0);
    // H.264 encoders want even dimensions.
    let even = |v: f64| ((v * scale).round() as u32) & !1;
    let (width, height) = (even(capture_rect.width), even(capture_rect.height));

    let mut config = SCStreamConfiguration::new()
      .with_width(width)
      .with_height(height)
      .with_fps(options.fps.clamp(24, 120))
      .with_queue_depth(6)
      .with_shows_cursor(false)
      .with_captures_audio(options.system_audio)
      .with_excludes_current_process_audio(true)
      .with_captures_microphone(options.microphone)?;
    if let Some(rect) = source_rect {
      config = config.with_source_rect(rect);
    }

    let video_path = project_dir.join("recording/screen.mp4");
    let output_config = SCRecordingOutputConfiguration::new()
      .map_err(|e| CaptureError::Stream(e.to_string()))?
      .with_output_url(&video_path)
      .map_err(|_| CaptureError::Stream("invalid output path".into()))?
      .with_video_codec(match options.codec {
        Codec::H264 => SCRecordingOutputCodec::H264,
        Codec::Hevc => SCRecordingOutputCodec::HEVC,
      })
      .with_output_file_type(SCRecordingOutputFileType::MP4);

    let clock = SessionClock::start();
    let started = Arc::new(AtomicU64::new(0));
    let (finished_tx, finished) = mpsc::channel();
    let failed_tx = finished_tx.clone();
    let started_flag = started.clone();
    let failure: Arc<Mutex<Option<String>>> = Arc::default();
    let failure_cb = failure.clone();
    let callbacks = RecordingCallbacks::new()
      .on_start(move || {
        started_flag.store(now_ns(), Ordering::Release);
      })
      .on_fail(move |err| {
        log::error!("recording failed: {err}");
        *failure_cb.lock().unwrap() = Some(err.clone());
        let _ = failed_tx.send(Err(err));
      })
      .on_finish(move || {
        let _ = finished_tx.send(Ok(()));
      });
    let output = SCRecordingOutput::new_with_delegate(&output_config, callbacks).ok_or(CaptureError::Unsupported)?;

    let mut stream = SCStream::new(&filter, &config)?;
    // A no-op screen handler keeps SCStream from logging dropped frames; the
    // recording output receives every frame regardless.
    stream.add_output_handler(|_sample: CMSampleBuffer, _kind: SCStreamOutputType| {}, SCStreamOutputType::Screen)?;
    stream.add_recording_output(&output)?;

    let input = InputRecorder::start(&project_dir.join("recording/input"), &project_dir.join("recording/cursors"), clock)
      .map_err(CaptureError::Io)?;

    stream.start_capture()?;

    // Wait briefly for the first frame so we can report real failures.
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while started.load(Ordering::Acquire) == 0 && std::time::Instant::now() < deadline {
      if let Some(err) = failure.lock().unwrap().clone() {
        let _ = stream.stop_capture();
        let _ = input.stop();
        return Err(CaptureError::Stream(err));
      }
      std::thread::sleep(Duration::from_millis(10));
    }

    let info = SessionInfo {
      format: 1,
      options,
      capture_rect,
      scale,
      width,
      height,
      video_start_ms: 0.0,
      duration_ms: 0.0,
      started_at_unix_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0),
    };

    Ok(Self { stream, output, input: Some(input), clock, started, finished, dir: project_dir.to_path_buf(), info })
  }

  /// Seconds recorded so far.
  pub fn elapsed(&self) -> f64 {
    let d = self.output.recorded_duration();
    if d.timescale > 0 { d.value as f64 / d.timescale as f64 } else { 0.0 }
  }

  pub fn stop(mut self) -> Result<RecordingSummary, CaptureError> {
    let duration_ms = self.elapsed() * 1000.0;
    self.stream.stop_capture()?;
    // The file is only complete once the output reports it finished.
    match self.finished.recv_timeout(Duration::from_secs(10)) {
      Ok(Ok(())) => {}
      Ok(Err(err)) => return Err(CaptureError::Stream(err)),
      Err(_) => log::warn!("recording output did not report finishing in time"),
    }
    let input = self.input.take().map(InputRecorder::stop).ok_or(CaptureError::Stream("input already stopped".into()))?;

    let started_ns = self.started.load(Ordering::Acquire);
    self.info.video_start_ms = if started_ns > 0 { started_ns.saturating_sub(self.clock.origin_ns()) as f64 / 1e6 } else { 0.0 };
    self.info.duration_ms = duration_ms;
    let recording = self.dir.join("recording");
    std::fs::write(recording.join("session.json"), serde_json::to_vec_pretty(&self.info).map_err(CaptureError::Json)?)?;

    let clicks: Vec<Click> = read_jsonl::<Click>(&recording.join("input/clicks.jsonl")).into_iter().filter(|c| c.down).collect();
    let mut moves: Vec<Move> = Vec::new();
    for m in read_jsonl::<Move>(&recording.join("input/moves.jsonl")) {
      if moves.last().is_none_or(|last| m.t - last.t >= 33.0) {
        moves.push(m);
      }
    }

    Ok(RecordingSummary { project_dir: self.dir.clone(), video_path: recording.join("screen.mp4"), session: self.info, input, clicks, moves })
  }
}

//! Input tracks recorded alongside the video.
//!
//! - `moves.jsonl`: cursor position sampled at 120 Hz, written only when it
//!   changes, with the cursor image id.
//! - `clicks.jsonl`: mouse down/up from a listen-only event tap, or from
//!   polling button state when Input Monitoring isn't granted.
//! - `keys.jsonl`: key down/up with modifiers (event tap only).
//! - `scrolls.jsonl`: scroll deltas (event tap only).
//!
//! Every line is flushed as it's written, so a crash keeps the track up to the
//! last event. Coordinates are global display points.

use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::{Arc, mpsc};
use std::thread::JoinHandle;
use std::time::Duration;

use crate::clock::SessionClock;
use crate::cursor::{CursorAtlas, CursorImage};

/* ───────────────────────── CoreGraphics / CoreFoundation FFI ───────────────────────── */

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
  x: f64,
  y: f64,
}

type CGEventRef = *mut c_void;
type CFMachPortRef = *mut c_void;
type CFRunLoopRef = *mut c_void;
type TapCallback = extern "C" fn(proxy: *mut c_void, kind: u32, event: CGEventRef, user: *mut c_void) -> CGEventRef;

const SESSION_EVENT_TAP: u32 = 1;
const HEAD_INSERT: u32 = 0;
const LISTEN_ONLY: u32 = 1;
const COMBINED_SESSION_STATE: i32 = 0;

const LEFT_DOWN: u32 = 1;
const LEFT_UP: u32 = 2;
const RIGHT_DOWN: u32 = 3;
const RIGHT_UP: u32 = 4;
const KEY_DOWN: u32 = 10;
const KEY_UP: u32 = 11;
const SCROLL: u32 = 22;
const OTHER_DOWN: u32 = 25;
const OTHER_UP: u32 = 26;
const TAP_DISABLED_TIMEOUT: u32 = 0xFFFF_FFFE;
const TAP_DISABLED_USER: u32 = 0xFFFF_FFFF;

const FIELD_CLICK_STATE: u32 = 1;
const FIELD_KEYCODE: u32 = 9;
const FIELD_SCROLL_DY: u32 = 11;
const FIELD_SCROLL_DX: u32 = 12;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
  fn CGEventCreate(source: *const c_void) -> CGEventRef;
  fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
  fn CGEventGetFlags(event: CGEventRef) -> u64;
  fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
  fn CGEventKeyboardGetUnicodeString(event: CGEventRef, max: usize, actual: *mut usize, chars: *mut u16);
  fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
  fn CGEventTapCreate(tap: u32, place: u32, options: u32, mask: u64, callback: TapCallback, user: *mut c_void) -> CFMachPortRef;
  fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
  fn CFRelease(cf: *const c_void);
  fn CFMachPortCreateRunLoopSource(allocator: *const c_void, port: CFMachPortRef, order: isize) -> *mut c_void;
  fn CFMachPortInvalidate(port: CFMachPortRef);
  fn CFRunLoopGetCurrent() -> CFRunLoopRef;
  fn CFRunLoopAddSource(rl: CFRunLoopRef, source: *mut c_void, mode: *const c_void);
  fn CFRunLoopRun();
  fn CFRunLoopStop(rl: CFRunLoopRef);
  static kCFRunLoopCommonModes: *const c_void;
}

fn mouse_location() -> CGPoint {
  unsafe {
    let event = CGEventCreate(std::ptr::null());
    if event.is_null() {
      return CGPoint { x: 0.0, y: 0.0 };
    }
    let p = CGEventGetLocation(event);
    CFRelease(event);
    p
  }
}

/* ───────────────────────── Track records ───────────────────────── */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Move {
  /// Milliseconds on the session clock.
  pub t: f64,
  pub x: f64,
  pub y: f64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub c: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Click {
  pub t: f64,
  pub x: f64,
  pub y: f64,
  /// "left" | "right" | "other"
  pub button: String,
  pub down: bool,
  /// 1 for a single click, 2 for a double click…
  pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Key {
  pub t: f64,
  pub code: i64,
  #[serde(skip_serializing_if = "String::is_empty")]
  pub text: String,
  pub down: bool,
  /// CGEventFlags bitmask (⌘ ⌥ ⌃ ⇧).
  pub flags: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Scroll {
  pub t: f64,
  pub x: f64,
  pub y: f64,
  pub dx: i64,
  pub dy: i64,
}

enum Event {
  Click(Click),
  Key(Key),
  Scroll(Scroll),
}

struct JsonLines {
  out: BufWriter<File>,
}

impl JsonLines {
  fn create(path: &Path) -> std::io::Result<Self> {
    Ok(Self { out: BufWriter::new(File::create(path)?) })
  }
  fn write<T: Serialize>(&mut self, value: &T) {
    if serde_json::to_writer(&mut self.out, value).is_ok() {
      let _ = self.out.write_all(b"\n");
      let _ = self.out.flush();
    }
  }
}

/* ───────────────────────── Event tap ───────────────────────── */

struct TapContext {
  clock: SessionClock,
  tx: mpsc::Sender<Event>,
  port: AtomicPtr<c_void>,
}

extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: CGEventRef, user: *mut c_void) -> CGEventRef {
  let ctx = unsafe { &*(user as *const TapContext) };
  if kind == TAP_DISABLED_TIMEOUT || kind == TAP_DISABLED_USER {
    // macOS disables slow taps; turn it straight back on.
    let port = ctx.port.load(Ordering::Acquire);
    if !port.is_null() {
      unsafe { CGEventTapEnable(port, true) };
    }
    return event;
  }
  let t = ctx.clock.ms();
  let p = unsafe { CGEventGetLocation(event) };
  let record = match kind {
    LEFT_DOWN | LEFT_UP | RIGHT_DOWN | RIGHT_UP | OTHER_DOWN | OTHER_UP => {
      let button = match kind {
        LEFT_DOWN | LEFT_UP => "left",
        RIGHT_DOWN | RIGHT_UP => "right",
        _ => "other",
      };
      let down = matches!(kind, LEFT_DOWN | RIGHT_DOWN | OTHER_DOWN);
      let count = unsafe { CGEventGetIntegerValueField(event, FIELD_CLICK_STATE) };
      Event::Click(Click { t, x: p.x, y: p.y, button: button.into(), down, count })
    }
    KEY_DOWN | KEY_UP => {
      let mut buf = [0u16; 8];
      let mut len = 0usize;
      unsafe { CGEventKeyboardGetUnicodeString(event, buf.len(), &mut len, buf.as_mut_ptr()) };
      Event::Key(Key {
        t,
        code: unsafe { CGEventGetIntegerValueField(event, FIELD_KEYCODE) },
        text: String::from_utf16_lossy(&buf[..len.min(buf.len())]),
        down: kind == KEY_DOWN,
        flags: unsafe { CGEventGetFlags(event) },
      })
    }
    SCROLL => Event::Scroll(Scroll {
      t,
      x: p.x,
      y: p.y,
      dx: unsafe { CGEventGetIntegerValueField(event, FIELD_SCROLL_DX) },
      dy: unsafe { CGEventGetIntegerValueField(event, FIELD_SCROLL_DY) },
    }),
    _ => return event,
  };
  let _ = ctx.tx.send(record);
  event
}

/// Runs a listen-only event tap on its own run loop thread.
struct EventTap {
  runloop: Arc<AtomicPtr<c_void>>,
  thread: JoinHandle<()>,
}

impl EventTap {
  /// Starts the tap, or returns None when Input Monitoring isn't granted.
  fn start(clock: SessionClock, tx: mpsc::Sender<Event>) -> Option<Self> {
    let mask: u64 = [LEFT_DOWN, LEFT_UP, RIGHT_DOWN, RIGHT_UP, OTHER_DOWN, OTHER_UP, KEY_DOWN, KEY_UP, SCROLL]
      .iter()
      .fold(0, |m, k| m | (1u64 << k));
    let runloop = Arc::new(AtomicPtr::new(std::ptr::null_mut()));
    let (ready_tx, ready_rx) = mpsc::channel::<bool>();
    let rl = runloop.clone();
    let thread = std::thread::Builder::new()
      .name("spontaneous-event-tap".into())
      .spawn(move || unsafe {
        let ctx = Box::into_raw(Box::new(TapContext { clock, tx, port: AtomicPtr::new(std::ptr::null_mut()) }));
        let port = CGEventTapCreate(SESSION_EVENT_TAP, HEAD_INSERT, LISTEN_ONLY, mask, on_event, ctx.cast());
        if port.is_null() {
          let _ = ready_tx.send(false);
          drop(Box::from_raw(ctx));
          return;
        }
        (*ctx).port.store(port, Ordering::Release);
        let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
        let current = CFRunLoopGetCurrent();
        CFRunLoopAddSource(current, source, kCFRunLoopCommonModes);
        CGEventTapEnable(port, true);
        rl.store(current, Ordering::Release);
        let _ = ready_tx.send(true);
        CFRunLoopRun();
        CGEventTapEnable(port, false);
        CFMachPortInvalidate(port);
        CFRelease(source);
        CFRelease(port);
        drop(Box::from_raw(ctx));
      })
      .ok()?;
    if ready_rx.recv().unwrap_or(false) {
      Some(Self { runloop, thread })
    } else {
      let _ = thread.join();
      None
    }
  }

  fn stop(self) {
    let rl = self.runloop.load(Ordering::Acquire);
    if !rl.is_null() {
      unsafe { CFRunLoopStop(rl) };
    }
    let _ = self.thread.join();
  }
}

/* ───────────────────────── Recorder ───────────────────────── */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSummary {
  pub event_tap: bool,
  pub moves: usize,
  pub clicks: usize,
  pub keys: usize,
  pub cursors: Vec<CursorImage>,
}

pub struct InputRecorder {
  stop: Arc<AtomicBool>,
  tap: Option<EventTap>,
  sampler: JoinHandle<(usize, Option<CursorAtlas>)>,
  writer: JoinHandle<(usize, usize)>,
  dir: PathBuf,
}

const SAMPLE_INTERVAL: Duration = Duration::from_micros(8_333); // 120 Hz
const CURSOR_EVERY: u32 = 4; // read the cursor image at 30 Hz

impl InputRecorder {
  pub fn start(dir: &Path, cursors_dir: &Path, clock: SessionClock) -> std::io::Result<Self> {
    std::fs::create_dir_all(dir)?;
    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<Event>();
    let tap = EventTap::start(clock, tx.clone());
    if tap.is_none() {
      log::info!("input: no Input Monitoring grant; clicks come from button polling, keys are off");
    }

    let mut clicks = JsonLines::create(&dir.join("clicks.jsonl"))?;
    let mut keys = JsonLines::create(&dir.join("keys.jsonl"))?;
    let mut scrolls = JsonLines::create(&dir.join("scrolls.jsonl"))?;
    let writer = std::thread::Builder::new().name("spontaneous-input-writer".into()).spawn(move || {
      let (mut n_clicks, mut n_keys) = (0, 0);
      for event in rx {
        match event {
          Event::Click(c) => {
            n_clicks += c.down as usize;
            clicks.write(&c)
          }
          Event::Key(k) => {
            n_keys += k.down as usize;
            keys.write(&k)
          }
          Event::Scroll(s) => scrolls.write(&s),
        }
      }
      (n_clicks, n_keys)
    })?;

    let mut moves = JsonLines::create(&dir.join("moves.jsonl"))?;
    let mut atlas = CursorAtlas::new(cursors_dir).ok();
    let poll_buttons = tap.is_none();
    let stop_flag = stop.clone();
    let sampler = std::thread::Builder::new().name("spontaneous-input-sampler".into()).spawn(move || {
      let mut last: Option<(f64, f64, Option<String>)> = None;
      let mut cursor: Option<String> = None;
      let mut buttons = [false; 2];
      let mut count = 0usize;
      let mut tick = 0u32;
      while !stop_flag.load(Ordering::Acquire) {
        let t = clock.ms();
        let p = mouse_location();
        if tick % CURSOR_EVERY == 0 {
          cursor = atlas.as_mut().and_then(|a| a.current());
        }
        tick = tick.wrapping_add(1);
        let changed = match &last {
          Some((x, y, c)) => *x != p.x || *y != p.y || *c != cursor,
          None => true,
        };
        if changed {
          moves.write(&Move { t, x: p.x, y: p.y, c: cursor.clone() });
          last = Some((p.x, p.y, cursor.clone()));
          count += 1;
        }
        if poll_buttons {
          for (i, (button, name)) in [(0u32, "left"), (1u32, "right")].into_iter().enumerate() {
            let down = unsafe { CGEventSourceButtonState(COMBINED_SESSION_STATE, button) };
            if down != buttons[i] {
              buttons[i] = down;
              let _ = tx.send(Event::Click(Click { t, x: p.x, y: p.y, button: name.into(), down, count: 1 }));
            }
          }
        }
        std::thread::sleep(SAMPLE_INTERVAL);
      }
      drop(tx);
      (count, atlas)
    })?;

    Ok(Self { stop, tap, sampler, writer, dir: dir.to_path_buf() })
  }

  pub fn stop(self) -> InputSummary {
    self.stop.store(true, Ordering::Release);
    let event_tap = self.tap.is_some();
    if let Some(tap) = self.tap {
      tap.stop();
    }
    let (moves, atlas) = self.sampler.join().unwrap_or((0, None));
    let (clicks, keys) = self.writer.join().unwrap_or((0, 0));
    let cursors = atlas.and_then(|a| a.finish().ok()).unwrap_or_default();
    log::info!("input: {moves} moves, {clicks} clicks, {keys} keys, {} cursors in {}", cursors.len(), self.dir.display());
    InputSummary { event_tap, moves, clicks, keys, cursors }
  }
}

/// Read a JSON-lines track back (used to hand clicks and moves to the editor).
pub fn read_jsonl<T: for<'de> Deserialize<'de>>(path: &Path) -> Vec<T> {
  std::fs::read_to_string(path)
    .map(|s| s.lines().filter_map(|l| serde_json::from_str(l).ok()).collect())
    .unwrap_or_default()
}


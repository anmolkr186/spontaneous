//! What can be recorded: displays and windows.

use screencapturekit::prelude::*;
use serde::Serialize;

use crate::CaptureError;

/// A rectangle in global display points (origin at the top-left of the main display).
#[derive(Debug, Clone, Copy, Serialize, serde::Deserialize, PartialEq)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

impl From<CGRect> for Rect {
  fn from(r: CGRect) -> Self {
    Self { x: r.origin.x, y: r.origin.y, width: r.size.width, height: r.size.height }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplaySource {
  pub id: u32,
  pub name: String,
  pub frame: Rect,
  pub is_main: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSource {
  pub id: u32,
  /// Stacking order, 0 = frontmost. Used to hit-test the window under the cursor.
  pub z: usize,
  pub title: String,
  pub app_name: String,
  pub bundle_id: String,
  pub frame: Rect,
}

#[derive(Debug, Clone, Serialize)]
pub struct Sources {
  pub displays: Vec<DisplaySource>,
  pub windows: Vec<WindowSource>,
}

/// Displays and recordable windows, excluding our own windows, menu-bar items
/// and tiny utility windows.
pub fn list() -> Result<Sources, CaptureError> {
  if !crate::permissions::screen_granted() {
    return Err(CaptureError::NotPermitted);
  }
  let content = SCShareableContent::create()
    .with_exclude_desktop_windows(true)
    .with_on_screen_windows_only(true)
    .get()
    .map_err(|e| CaptureError::Content(e.to_string()))?;

  let own_pid = std::process::id() as i32;
  let order = front_to_back();
  let displays = content
    .displays()
    .iter()
    .enumerate()
    .map(|(i, d)| {
      let frame: Rect = d.frame().into();
      DisplaySource {
        id: d.display_id(),
        name: if i == 0 { "Main display".into() } else { format!("Display {}", i + 1) },
        is_main: frame.x == 0.0 && frame.y == 0.0,
        frame,
      }
    })
    .collect();

  let mut windows: Vec<WindowSource> = content
    .windows()
    .iter()
    .filter(|w| w.window_layer() == 0 && w.is_on_screen())
    .filter_map(|w| {
      let app = w.owning_application()?;
      if app.process_id() == own_pid {
        return None;
      }
      let frame: Rect = w.frame().into();
      if frame.width < 120.0 || frame.height < 80.0 {
        return None;
      }
      Some(WindowSource {
        z: order.iter().position(|id| *id == w.window_id()).unwrap_or(usize::MAX),
        id: w.window_id(),
        title: w.title().filter(|t| !t.is_empty()).unwrap_or_else(|| app.application_name()),
        app_name: app.application_name(),
        bundle_id: app.bundle_identifier(),
        frame,
      })
    })
    .collect();
  windows.sort_by_key(|w| w.z);

  Ok(Sources { displays, windows })
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
  fn CGWindowListCreate(option: u32, relative_to: u32) -> *const std::ffi::c_void;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
  fn CFArrayGetCount(array: *const std::ffi::c_void) -> isize;
  fn CFArrayGetValueAtIndex(array: *const std::ffi::c_void, index: isize) -> *const std::ffi::c_void;
  fn CFRelease(cf: *const std::ffi::c_void);
}

/// On-screen window ids, frontmost first.
fn front_to_back() -> Vec<u32> {
  const ON_SCREEN_ONLY: u32 = 1;
  unsafe {
    let list = CGWindowListCreate(ON_SCREEN_ONLY, 0);
    if list.is_null() {
      return Vec::new();
    }
    // The array holds CGWindowIDs stored directly as pointer-sized values.
    let ids = (0..CFArrayGetCount(list)).map(|i| CFArrayGetValueAtIndex(list, i) as usize as u32).collect();
    CFRelease(list);
    ids
  }
}

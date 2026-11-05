//! What the user was pointing at, from the Accessibility API.
//!
//! Clicks record the control under the cursor ("button Export"), and a focus
//! track records the frontmost app, window, page URL and focused control. The
//! editing agent reads these as text, so it can name and aim edits without
//! looking at frames. See docs/AGENT_HARNESS.md, layer 1.
//!
//! Needs the Accessibility grant; without it every lookup returns None and the
//! focus track is empty. Never records what the user typed: text field values
//! are skipped, and only static text contributes its value as a label.

use serde::{Deserialize, Serialize};
use std::ffi::{c_char, c_void};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

use crate::clock::SessionClock;

type CFTypeRef = *const c_void;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
  fn AXIsProcessTrusted() -> bool;
  fn AXUIElementCreateSystemWide() -> CFTypeRef;
  fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
  fn AXUIElementCopyElementAtPosition(element: CFTypeRef, x: f32, y: f32, out: *mut CFTypeRef) -> i32;
  fn AXUIElementCopyAttributeValue(element: CFTypeRef, attribute: CFTypeRef, out: *mut CFTypeRef) -> i32;
  fn AXUIElementSetMessagingTimeout(element: CFTypeRef, seconds: f32) -> i32;
  fn AXValueGetValue(value: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
  fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFTypeRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
  fn CFRelease(cf: CFTypeRef);
  fn CFArrayGetCount(array: CFTypeRef) -> isize;
  fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
  fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
  fn CFNumberGetValue(number: CFTypeRef, kind: isize, out: *mut c_void) -> bool;
  fn CFGetTypeID(cf: CFTypeRef) -> usize;
  fn CFStringGetTypeID() -> usize;
  fn CFURLGetTypeID() -> usize;
  fn CFURLGetString(url: CFTypeRef) -> CFTypeRef;
  fn CFStringCreateWithBytes(alloc: CFTypeRef, bytes: *const u8, len: isize, encoding: u32, external: bool) -> CFTypeRef;
  fn CFStringGetLength(s: CFTypeRef) -> isize;
  fn CFStringGetMaximumSizeForEncoding(len: isize, encoding: u32) -> isize;
  fn CFStringGetCString(s: CFTypeRef, buf: *mut c_char, size: isize, encoding: u32) -> bool;
}

const UTF8: u32 = 0x0800_0100;
const NUMBER_I32: isize = 3;
const WINDOWS_ON_SCREEN: u32 = 1 | 16; // on-screen only, excluding the desktop
const AX_POINT: u32 = 1;
const AX_SIZE: u32 = 2;
/// A hung app would otherwise stall a lookup for the system default of 6 s.
const TIMEOUT_SECS: f32 = 0.2;
const LABEL_MAX: usize = 80;
/// How far up from the hit element to look for the control that owns it.
const CONTROL_DEPTH: usize = 4;
/// How far up from the focused element to look for a web page.
const WEB_DEPTH: usize = 40;
const FOCUS_INTERVAL: Duration = Duration::from_millis(200);

/// Roles a click acts on. A click usually lands on the text or image inside
/// one of these, so the lookup walks up to it.
const CONTROLS: &[&str] = &[
  "AXButton", "AXLink", "AXMenuItem", "AXMenuBarItem", "AXMenuButton", "AXPopUpButton", "AXCheckBox",
  "AXRadioButton", "AXTextField", "AXTextArea", "AXComboBox", "AXSlider", "AXDisclosureTriangle", "AXCell",
  "AXRow", "AXTab", "AXIncrementor", "AXColorWell", "AXDockItem",
];

/* ───────────────────────── CoreFoundation helpers ───────────────────────── */

/// An owned CF reference, released on drop.
struct Owned(CFTypeRef);

impl Drop for Owned {
  fn drop(&mut self) {
    unsafe { CFRelease(self.0) };
  }
}

impl Owned {
  fn new(ptr: CFTypeRef) -> Option<Self> {
    (!ptr.is_null()).then_some(Self(ptr))
  }
}

fn cfstr(s: &str) -> Owned {
  Owned(unsafe { CFStringCreateWithBytes(std::ptr::null(), s.as_ptr(), s.len() as isize, UTF8, false) })
}

fn string(cf: CFTypeRef) -> Option<String> {
  unsafe {
    if cf.is_null() {
      return None;
    }
    let id = CFGetTypeID(cf);
    let s = if id == CFStringGetTypeID() {
      cf
    } else if id == CFURLGetTypeID() {
      CFURLGetString(cf)
    } else {
      return None;
    };
    let size = CFStringGetMaximumSizeForEncoding(CFStringGetLength(s), UTF8) + 1;
    let mut buf = vec![0u8; size.max(1) as usize];
    if !CFStringGetCString(s, buf.as_mut_ptr().cast(), size, UTF8) {
      return None;
    }
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    Some(String::from_utf8_lossy(&buf[..end]).into_owned())
  }
}

fn number(dict: CFTypeRef, key: &str) -> Option<i32> {
  let value = unsafe { CFDictionaryGetValue(dict, cfstr(key).0) };
  let mut out = 0i32;
  (!value.is_null() && unsafe { CFNumberGetValue(value, NUMBER_I32, (&raw mut out).cast()) }).then_some(out)
}

/// The owner of the frontmost normal window. Window info is ordered front to
/// back, and layer 0 skips the menu bar, floating panels and our own dock.
fn frontmost_pid() -> Option<i32> {
  let list = Owned::new(unsafe { CGWindowListCopyWindowInfo(WINDOWS_ON_SCREEN, 0) })?;
  (0..unsafe { CFArrayGetCount(list.0) })
    .map(|i| unsafe { CFArrayGetValueAtIndex(list.0, i) })
    .find(|&w| number(w, "kCGWindowLayer") == Some(0))
    .and_then(|w| number(w, "kCGWindowOwnerPID"))
}

fn attr(element: CFTypeRef, name: &str) -> Option<Owned> {
  let key = cfstr(name);
  let mut out: CFTypeRef = std::ptr::null();
  let err = unsafe { AXUIElementCopyAttributeValue(element, key.0, &mut out) };
  if err == 0 { Owned::new(out) } else { None }
}

fn attr_string(element: CFTypeRef, name: &str) -> Option<String> {
  attr(element, name).and_then(|v| string(v.0)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn frame(element: CFTypeRef) -> Option<[f64; 4]> {
  let mut point = [0f64; 2];
  let mut size = [0f64; 2];
  let pos = attr(element, "AXPosition")?;
  let dim = attr(element, "AXSize")?;
  let ok = unsafe { AXValueGetValue(pos.0, AX_POINT, point.as_mut_ptr().cast()) && AXValueGetValue(dim.0, AX_SIZE, size.as_mut_ptr().cast()) };
  ok.then(|| [point[0], point[1], size[0], size[1]].map(|v| (v * 10.0).round() / 10.0))
}

/// Strips the invisible direction marks some apps put around names, folds
/// line breaks, and caps the length.
fn clip(s: String) -> String {
  let invisible = |c: &char| matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}');
  let clean: String = s.chars().filter(|c| !invisible(c)).collect();
  let clean = clean.split_whitespace().collect::<Vec<_>>().join(" ");
  if clean.chars().count() <= LABEL_MAX {
    return clean;
  }
  let mut out: String = clean.chars().take(LABEL_MAX - 1).collect();
  out.push('…');
  out
}

/// "AXButton" → "button", "AXStaticText" → "staticText".
fn short_role(role: &str) -> String {
  let bare = role.strip_prefix("AX").unwrap_or(role);
  let mut chars = bare.chars();
  chars.next().map(|c| c.to_lowercase().chain(chars).collect()).unwrap_or_default()
}

/* ───────────────────────── Elements ───────────────────────── */

/// A UI element, as the agent reads it: `button "Export"` at a frame.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AxElement {
  /// Short role: "button", "link", "textField", "menuItem"…
  pub role: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  /// Global display points, top-left origin: x, y, width, height.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub frame: Option<[f64; 4]>,
}

/// The visible name of an element. Text field values are what the user typed,
/// so they never count; static text is the one role whose value is its name.
fn label(element: CFTypeRef, role: &str) -> Option<String> {
  let mut names = ["AXTitle", "AXDescription"].into_iter().filter_map(|a| attr_string(element, a));
  let named = names.next().or_else(|| match role {
    "AXStaticText" => attr_string(element, "AXValue"),
    "AXTextField" | "AXTextArea" | "AXComboBox" => attr_string(element, "AXPlaceholderValue"),
    _ => None,
  });
  named.map(clip)
}

fn describe(element: CFTypeRef) -> Option<AxElement> {
  let role = attr_string(element, "AXRole")?;
  Some(AxElement { role: short_role(&role), label: label(element, &role), frame: frame(element) })
}

fn parent(element: CFTypeRef) -> Option<Owned> {
  attr(element, "AXParent")
}

/// Accessibility lookups for one thread. Each thread makes its own, so a slow
/// app only ever stalls the thread that asked.
pub struct Ax {
  system: Owned,
}

impl Ax {
  /// None when the app isn't trusted for Accessibility.
  pub fn new() -> Option<Self> {
    if !unsafe { AXIsProcessTrusted() } {
      return None;
    }
    let system = Owned::new(unsafe { AXUIElementCreateSystemWide() })?;
    unsafe { AXUIElementSetMessagingTimeout(system.0, TIMEOUT_SECS) };
    Some(Self { system })
  }

  /// The control at a point in global display points. Walks up from the
  /// element that was hit to the control that owns it, and borrows the hit
  /// element's text when the control has no name of its own (a link whose
  /// label is the text inside it).
  pub fn element_at(&self, x: f64, y: f64) -> Option<AxElement> {
    let mut out: CFTypeRef = std::ptr::null();
    if unsafe { AXUIElementCopyElementAtPosition(self.system.0, x as f32, y as f32, &mut out) } != 0 {
      return None;
    }
    let hit = Owned::new(out)?;
    let hit_role = attr_string(hit.0, "AXRole")?;
    let hit_label = label(hit.0, &hit_role);

    let mut current = None::<Owned>;
    for _ in 0..=CONTROL_DEPTH {
      let element = current.as_ref().map_or(hit.0, |o| o.0);
      if attr_string(element, "AXRole").is_some_and(|r| CONTROLS.contains(&r.as_str())) {
        let mut found = describe(element)?;
        if found.label.is_none() {
          found.label = hit_label;
        }
        return Some(found);
      }
      match parent(element) {
        Some(p) => current = Some(p),
        None => break,
      }
    }
    Some(AxElement { role: short_role(&hit_role), label: hit_label, frame: frame(hit.0) })
  }

  /// The frontmost app, its focused window, the page URL and the focused control.
  pub fn focus(&self) -> Focus {
    let mut focus = Focus::default();
    // The system-wide query fails with "cannot complete" for some frontmost
    // apps; asking the app directly works.
    let app = attr(self.system.0, "AXFocusedApplication")
      .or_else(|| frontmost_pid().and_then(|pid| Owned::new(unsafe { AXUIElementCreateApplication(pid) })));
    let Some(app) = app else { return focus };
    unsafe { AXUIElementSetMessagingTimeout(app.0, TIMEOUT_SECS) };
    focus.app = attr_string(app.0, "AXTitle");
    if let Some(window) = attr(app.0, "AXFocusedWindow") {
      focus.window = attr_string(window.0, "AXTitle").map(clip);
      focus.app = focus.app.map(clip);
      focus.url = attr_string(window.0, "AXDocument");
    }
    if let Some(element) = attr(app.0, "AXFocusedUIElement") {
      focus.element = describe(element.0);
      if focus.url.is_none() {
        focus.url = self.page_url(element);
      }
    }
    focus
  }

  /// Browsers put the URL on the web area that contains the focused element.
  fn page_url(&self, start: Owned) -> Option<String> {
    let mut current = start;
    for _ in 0..WEB_DEPTH {
      if attr_string(current.0, "AXRole").as_deref() == Some("AXWebArea") {
        return attr_string(current.0, "AXURL");
      }
      current = parent(current.0)?;
    }
    None
  }
}

/* ───────────────────────── Focus track ───────────────────────── */

/// One line of `focus.jsonl`, written when any field but `t` changes.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Focus {
  #[serde(default)]
  pub t: f64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub app: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub window: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub element: Option<AxElement>,
}

impl Focus {
  /// Scrolling moves the focused element's frame; that isn't a focus change.
  fn same_place(&self, other: &Focus) -> bool {
    let key = |f: &Focus| (f.app.clone(), f.window.clone(), f.url.clone(), f.element.as_ref().map(|e| (e.role.clone(), e.label.clone())));
    key(self) == key(other)
  }
}

/// Polls focus on its own thread. Polling at 5 Hz is enough to mark step
/// boundaries, and it avoids an observer per app.
pub struct FocusTracker {
  stop: Arc<AtomicBool>,
  thread: JoinHandle<usize>,
}

impl FocusTracker {
  /// None when Accessibility isn't granted; the track file is still created.
  pub fn start(path: &Path, clock: SessionClock) -> std::io::Result<Option<Self>> {
    let mut out = crate::input::JsonLines::create(path)?;
    if Ax::new().is_none() {
      return Ok(None);
    }
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let thread = std::thread::Builder::new().name("spontaneous-ax-focus".into()).spawn(move || {
      let Some(ax) = Ax::new() else { return 0 };
      let mut last: Option<Focus> = None;
      let mut count = 0;
      while !flag.load(Ordering::Acquire) {
        let t = clock.ms();
        let mut now = ax.focus();
        if last.as_ref().is_none_or(|l| !l.same_place(&now)) {
          now.t = (t * 10.0).round() / 10.0;
          out.write(&now);
          last = Some(now);
          count += 1;
        }
        std::thread::sleep(FOCUS_INTERVAL);
      }
      count
    })?;
    Ok(Some(Self { stop, thread }))
  }

  /// Stops polling and returns how many focus changes were written.
  pub fn stop(self) -> usize {
    self.stop.store(true, Ordering::Release);
    self.thread.join().unwrap_or(0)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn roles_are_short() {
    assert_eq!(short_role("AXButton"), "button");
    assert_eq!(short_role("AXStaticText"), "staticText");
    assert_eq!(short_role("Custom"), "custom");
  }

  #[test]
  fn long_labels_are_clipped() {
    assert_eq!(clip("a".repeat(LABEL_MAX + 5)).chars().count(), LABEL_MAX);
    assert_eq!(clip("Export".into()), "Export");
    assert_eq!(clip("\u{200E}Forwarded.\n\u{200E}Sent".into()), "Forwarded. Sent");
  }

  #[test]
  fn scrolling_is_not_a_focus_change() {
    let at = |y: f64| Focus {
      app: Some("Safari".into()),
      element: Some(AxElement { role: "link".into(), label: Some("Docs".into()), frame: Some([0.0, y, 10.0, 10.0]) }),
      ..Default::default()
    };
    assert!(at(10.0).same_place(&at(400.0)));
  }

  #[test]
  fn clicks_without_a_target_still_parse() {
    let c: crate::input::Click = serde_json::from_str(r#"{"t":1,"x":2,"y":3,"button":"left","down":true,"count":1}"#).unwrap();
    assert!(c.target.is_none());
  }
}

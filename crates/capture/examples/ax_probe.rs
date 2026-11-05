//! cargo run -p spontaneous-capture --example ax_probe -- [seconds]
//! Prints the focused app/window/URL/control and the control under the cursor,
//! twice a second. Needs the Accessibility grant for the process running it.
//! --grid[=x,y,w,h]  what a click would record at a grid of points, without clicking
//! --focus run the focus track for [seconds] and write it to a temp file
use spontaneous_capture::ax::{Ax, FocusTracker};

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
  fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
  fn CGEventGetLocation(event: *mut std::ffi::c_void) -> Point;
}

#[repr(C)]
struct Point {
  x: f64,
  y: f64,
}

fn main() {
  let secs: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(5);
  let Some(ax) = Ax::new() else {
    return println!("not trusted for Accessibility: grant it to the app running this (Terminal, Claude…) and rerun");
  };
  if std::env::args().any(|a| a == "--focus") {
    // The focus track as a recording writes it.
    let path = std::env::temp_dir().join("ax-probe-focus.jsonl");
    let clock = spontaneous_capture::clock::SessionClock::start();
    let tracker = FocusTracker::start(&path, clock).expect("create track").expect("trusted");
    std::thread::sleep(std::time::Duration::from_secs(secs));
    println!("{} focus changes in {secs}s → {}", tracker.stop(), path.display());
    return;
  }
  if std::env::args().any(|a| a.starts_with("--grid")) {
    // What a click would record across the main display, without clicking.
    let mut seen = std::collections::BTreeSet::new();
    let mut total = std::time::Duration::ZERO;
    let mut n = 0;
    // Over the focused control's frame (a whole page for a browser), else the main display.
    // --grid=x,y,w,h picks the area by hand.
    let given = std::env::args().find_map(|a| a.strip_prefix("--grid=").map(str::to_string)).and_then(|s| {
      let v: Vec<f64> = s.split(',').filter_map(|n| n.trim().parse().ok()).collect();
      (v.len() == 4).then(|| [v[0], v[1], v[2], v[3]])
    });
    let [ox, oy, w, h] = given.or_else(|| ax.focus().element.and_then(|e| e.frame)).unwrap_or([0.0, 0.0, 1500.0, 960.0]);
    for gy in 0..20 {
      for gx in 0..30 {
        let (x, y) = (ox + (gx as f64 + 0.5) * w / 30.0, oy + (gy as f64 + 0.5) * h / 20.0);
        let started = std::time::Instant::now();
        let el = ax.element_at(x, y);
        total += started.elapsed();
        n += 1;
        if let Some(el) = el {
          seen.insert(serde_json::to_string(&el).unwrap_or_default());
        }
      }
    }
    println!("{n} points, {:.1} ms average", total.as_secs_f64() * 1000.0 / n as f64);
    for line in seen {
      println!("{line}");
    }
    return;
  }
  for _ in 0..secs * 2 {
    let Point { x, y } = unsafe { CGEventGetLocation(CGEventCreate(std::ptr::null())) };
    let started = std::time::Instant::now();
    let under = ax.element_at(x, y);
    let lookup = started.elapsed();
    println!("focus  {}", serde_json::to_string(&ax.focus()).unwrap_or_default());
    println!("cursor ({x:.0},{y:.0}) {} in {:.1} ms", serde_json::to_string(&under).unwrap_or_default(), lookup.as_secs_f64() * 1000.0);
    std::thread::sleep(std::time::Duration::from_millis(500));
  }
}

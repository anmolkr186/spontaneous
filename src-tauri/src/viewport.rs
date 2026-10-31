//! The canvas hole contract between the React layout and the native compositor.
//!
//! React measures the element that reserves space for the preview and reports its
//! rect in CSS pixels on every layout change. In phase 3 the wgpu compositor sizes
//! its CAMetalLayer to this rect; for now we only record it.

use serde::Deserialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct ViewportRect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
  pub scale: f64,
}

static LAST_RECT: Mutex<Option<ViewportRect>> = Mutex::new(None);

#[tauri::command]
pub fn set_viewport_rect(rect: ViewportRect) {
  let mut last = LAST_RECT.lock().expect("viewport lock poisoned");
  if last.map(|r| (r.width, r.height)) != Some((rect.width, rect.height)) {
    log::debug!("viewport {}x{} at ({}, {}) @{}", rect.width, rect.height, rect.x, rect.y, rect.scale);
  }
  *last = Some(rect);
}

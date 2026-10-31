//! Cursor atlas: every distinct system cursor seen during a recording, saved
//! once as a PNG with its hotspot. Moves reference cursors by id, so the editor
//! can redraw the real cursor (or swap in a different cursor set) at any size.

use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSCursor};
use objc2_foundation::NSDictionary;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorImage {
  pub id: String,
  pub file: String,
  /// Hotspot in image points.
  pub hotspot: [f64; 2],
  /// Image size in points.
  pub size: [f64; 2],
}

pub struct CursorAtlas {
  dir: PathBuf,
  by_hash: HashMap<u64, String>,
  images: Vec<CursorImage>,
  last_id: Option<String>,
}

impl CursorAtlas {
  pub fn new(dir: &Path) -> std::io::Result<Self> {
    std::fs::create_dir_all(dir)?;
    Ok(Self { dir: dir.to_path_buf(), by_hash: HashMap::new(), images: Vec::new(), last_id: None })
  }

  /// Id of the cursor currently shown by the system, saving it if new.
  /// Returns the previous id when the image can't be read, so a single failed
  /// read doesn't break the track.
  pub fn current(&mut self) -> Option<String> {
    match self.read_current() {
      Some(id) => {
        self.last_id = Some(id.clone());
        Some(id)
      }
      None => self.last_id.clone(),
    }
  }

  fn read_current(&mut self) -> Option<String> {
    // Deprecated in favor of showsCursor, but it is still the only API that
    // returns the cursor another app is showing.
    #[allow(deprecated)]
    let cursor = NSCursor::currentSystemCursor()?;
    let image = cursor.image();
    let tiff = image.TIFFRepresentation()?;
    let bytes = tiff.to_vec();
    let hotspot = cursor.hotSpot();

    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hotspot.x.to_bits().hash(&mut hasher);
    hotspot.y.to_bits().hash(&mut hasher);
    let key = hasher.finish();
    if let Some(id) = self.by_hash.get(&key) {
      return Some(id.clone());
    }

    let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
    let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
    let id = format!("c{}", self.images.len());
    let file = format!("{id}.png");
    if let Err(err) = std::fs::write(self.dir.join(&file), png.to_vec()) {
      log::warn!("cursor atlas: could not write {file}: {err}");
      return None;
    }
    let size = image.size();
    self.images.push(CursorImage { id: id.clone(), file, hotspot: [hotspot.x, hotspot.y], size: [size.width, size.height] });
    self.by_hash.insert(key, id.clone());
    Some(id)
  }

  /// Write `atlas.json` and return the images.
  pub fn finish(self) -> std::io::Result<Vec<CursorImage>> {
    std::fs::write(self.dir.join("atlas.json"), serde_json::to_vec_pretty(&self.images)?)?;
    Ok(self.images)
  }
}

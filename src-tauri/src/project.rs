//! Writing a project's edit list into its `.spontaneous` package.

use std::path::{Path, PathBuf};

/// Atomically write `project.json` (temp file + rename), so a crash mid-write
/// never leaves a half-written project.
#[tauri::command]
pub fn project_save(dir: String, project: serde_json::Value) -> Result<(), String> {
  let dir = PathBuf::from(dir);
  if dir.extension().and_then(|e| e.to_str()) != Some("spontaneous") || !dir.is_dir() {
    return Err("not a Spontaneous project".into());
  }
  write_atomic(&dir.join("project.json"), &serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  let tmp = path.with_extension("json.tmp");
  std::fs::write(&tmp, bytes)?;
  std::fs::rename(tmp, path)
}

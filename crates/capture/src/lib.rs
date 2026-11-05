//! Spontaneous capture engine: ScreenCaptureKit video and audio, input tracks,
//! cursor atlas, and the TCC permissions they need. macOS 15+.
//!
//! See docs/ARCHITECTURE.md §3.

pub mod ax;
pub mod clock;
pub mod cursor;
pub mod input;
pub mod permissions;
pub mod recorder;
pub mod sources;

pub use permissions::{PermissionKind, PermissionState, PermissionsStatus};
pub use recorder::{Codec, RecordOptions, Recording, RecordingSummary, SessionInfo, Target, create_package};
pub use sources::{DisplaySource, Rect, Sources, WindowSource};

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
  #[error("Screen Recording permission is required")]
  NotPermitted,
  #[error("the display or window is no longer available")]
  SourceGone,
  #[error("this needs macOS 15 or later")]
  Unsupported,
  #[error("could not read shareable content: {0}")]
  Content(String),
  #[error("capture failed: {0}")]
  Stream(String),
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Json(serde_json::Error),
}

impl From<screencapturekit::prelude::SCError> for CaptureError {
  fn from(err: screencapturekit::prelude::SCError) -> Self {
    CaptureError::Stream(err.to_string())
  }
}

impl serde::Serialize for CaptureError {
  fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&self.to_string())
  }
}

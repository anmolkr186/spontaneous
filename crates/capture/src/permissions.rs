//! TCC permissions the recorder depends on.
//!
//! | Permission        | Needed for                              | Required |
//! |-------------------|-----------------------------------------|----------|
//! | Screen Recording  | ScreenCaptureKit, system audio          | yes      |
//! | Microphone        | voiceover / mic track                   | if mic   |
//! | Input Monitoring  | click and key events (CGEventTap)       | no*      |
//! | Accessibility     | click targets and focus track (`ax`)    | no       |
//!
//! *Without Input Monitoring we still sample cursor position and mouse buttons,
//! which needs no permission; only keystrokes are lost.

use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use std::process::Command;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
  fn CGPreflightScreenCaptureAccess() -> bool;
  fn CGRequestScreenCaptureAccess() -> bool;
  fn CGPreflightListenEventAccess() -> bool;
  fn CGRequestListenEventAccess() -> bool;
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
  fn AXIsProcessTrusted() -> bool;
  fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
  static kAXTrustedCheckOptionPrompt: *const c_void;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
  fn CFDictionaryCreate(
    allocator: *const c_void,
    keys: *const *const c_void,
    values: *const *const c_void,
    count: isize,
    key_callbacks: *const c_void,
    value_callbacks: *const c_void,
  ) -> *const c_void;
  fn CFRelease(cf: *const c_void);
  static kCFBooleanTrue: *const c_void;
  static kCFTypeDictionaryKeyCallBacks: c_void;
  static kCFTypeDictionaryValueCallBacks: c_void;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
  Screen,
  Microphone,
  InputMonitoring,
  Accessibility,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionState {
  Granted,
  Denied,
  /// Never asked; requesting will show the system prompt.
  NotDetermined,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionsStatus {
  pub screen: PermissionState,
  pub microphone: PermissionState,
  pub input_monitoring: PermissionState,
  pub accessibility: PermissionState,
}

fn bool_state(granted: bool) -> PermissionState {
  if granted { PermissionState::Granted } else { PermissionState::NotDetermined }
}

fn microphone_state() -> PermissionState {
  let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(AVMediaTypeAudio.expect("AVMediaTypeAudio")) };
  match status {
    AVAuthorizationStatus::Authorized => PermissionState::Granted,
    AVAuthorizationStatus::NotDetermined => PermissionState::NotDetermined,
    _ => PermissionState::Denied,
  }
}

/// Current state of every permission. Cheap; safe to call on every focus.
/// Screen Recording, checked without prompting. Anything that touches
/// ScreenCaptureKit calls this first: asking SCK without the grant makes macOS
/// show its alert again, on every call.
pub fn screen_granted() -> bool {
  unsafe { CGPreflightScreenCaptureAccess() }
}

pub fn status() -> PermissionsStatus {
  // The CG/AX preflight calls can't tell "denied" from "never asked", so a
  // missing grant reads as NotDetermined. The UI offers both the prompt and
  // a link to System Settings either way.
  PermissionsStatus {
    screen: bool_state(unsafe { CGPreflightScreenCaptureAccess() }),
    microphone: microphone_state(),
    input_monitoring: bool_state(unsafe { CGPreflightListenEventAccess() }),
    accessibility: bool_state(unsafe { AXIsProcessTrusted() }),
  }
}

/// Ask for a permission. Shows the system prompt the first time; afterwards
/// macOS only lets the user change it in System Settings.
pub fn request(kind: PermissionKind) {
  match kind {
    PermissionKind::Screen => {
      unsafe { CGRequestScreenCaptureAccess() };
    }
    PermissionKind::InputMonitoring => {
      unsafe { CGRequestListenEventAccess() };
    }
    PermissionKind::Accessibility => unsafe {
      let keys = [kAXTrustedCheckOptionPrompt];
      let values = [kCFBooleanTrue];
      let options = CFDictionaryCreate(
        std::ptr::null(),
        keys.as_ptr(),
        values.as_ptr(),
        1,
        &raw const kCFTypeDictionaryKeyCallBacks,
        &raw const kCFTypeDictionaryValueCallBacks,
      );
      AXIsProcessTrustedWithOptions(options);
      CFRelease(options);
    },
    PermissionKind::Microphone => unsafe {
      let block = block2::RcBlock::new(|_granted: objc2::runtime::Bool| {});
      AVCaptureDevice::requestAccessForMediaType_completionHandler(AVMediaTypeAudio.expect("AVMediaTypeAudio"), &block);
    },
  }
}

/// Open the matching pane of System Settings › Privacy & Security.
pub fn open_settings(kind: PermissionKind) {
  let anchor = match kind {
    PermissionKind::Screen => "Privacy_ScreenCapture",
    PermissionKind::Microphone => "Privacy_Microphone",
    PermissionKind::InputMonitoring => "Privacy_ListenEvent",
    PermissionKind::Accessibility => "Privacy_Accessibility",
  };
  let url = format!("x-apple.systempreferences:com.apple.preference.security?{anchor}");
  if let Err(err) = Command::new("open").arg(url).spawn() {
    log::warn!("could not open System Settings: {err}");
  }
}

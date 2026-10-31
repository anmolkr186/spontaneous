//! One clock for every track.
//!
//! Screen video, input events and cursor changes are all stamped with mach host
//! time, converted to milliseconds since the session origin. The video's own
//! start is recorded as an offset on the same clock, so the editor can align
//! input to frames without guessing.

use std::sync::OnceLock;

#[repr(C)]
struct MachTimebaseInfo {
  numer: u32,
  denom: u32,
}

unsafe extern "C" {
  fn mach_absolute_time() -> u64;
  fn mach_timebase_info(info: *mut MachTimebaseInfo) -> i32;
}

fn timebase() -> (u64, u64) {
  static TB: OnceLock<(u64, u64)> = OnceLock::new();
  *TB.get_or_init(|| {
    let mut info = MachTimebaseInfo { numer: 0, denom: 0 };
    unsafe { mach_timebase_info(&mut info) };
    (info.numer as u64, info.denom.max(1) as u64)
  })
}

/// Nanoseconds on the host clock.
pub fn now_ns() -> u64 {
  let (numer, denom) = timebase();
  let t = unsafe { mach_absolute_time() };
  (t as u128 * numer as u128 / denom as u128) as u64
}

/// A session clock: milliseconds since `origin`.
#[derive(Debug, Clone, Copy)]
pub struct SessionClock {
  origin_ns: u64,
}

impl SessionClock {
  pub fn start() -> Self {
    Self { origin_ns: now_ns() }
  }

  pub fn origin_ns(&self) -> u64 {
    self.origin_ns
  }

  /// Milliseconds since the origin, with sub-millisecond precision.
  pub fn ms(&self) -> f64 {
    now_ns().saturating_sub(self.origin_ns) as f64 / 1_000_000.0
  }
}

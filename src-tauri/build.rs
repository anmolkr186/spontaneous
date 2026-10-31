fn main() {
  // See crates/capture/build.rs: the Swift runtime for ScreenCaptureKit.
  println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
  tauri_build::build()
}

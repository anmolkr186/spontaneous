fn main() {
  // screencapturekit's Swift bridge links the Swift runtime, which lives in the
  // dyld shared cache under /usr/lib/swift. Link args don't propagate from a
  // dependency's build script, so every binary (examples, tests) needs this.
  println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

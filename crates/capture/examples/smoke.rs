//! cargo run -p spontaneous-capture --example smoke -- [seconds]
//! Lists sources, records the main display for a few seconds, prints the summary.
use spontaneous_capture::*;

fn main() {
  let secs: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(3);
  println!("permissions: {:?}", permissions::status());
  let sources = match sources::list() {
    Ok(s) => s,
    Err(e) => return println!("sources failed: {e}"),
  };
  println!("{} displays, {} windows", sources.displays.len(), sources.windows.len());
  for d in &sources.displays { println!("  display {} {:?}", d.id, d.frame); }
  for w in sources.windows.iter().take(5) { println!("  window {} {} — {}", w.id, w.app_name, w.title); }
  let main = sources.displays.iter().find(|d| d.is_main).unwrap_or(&sources.displays[0]);
  let root = std::env::temp_dir().join("spontaneous-smoke");
  let dir = create_package(&root, "Smoke").unwrap();
  let opts = RecordOptions { target: Target::Display { display_id: main.id }, fps: 60, system_audio: true, microphone: false, codec: Codec::H264 };
  let rec = match Recording::start(&dir, opts) { Ok(r) => r, Err(e) => return println!("start failed: {e}") };
  std::thread::sleep(std::time::Duration::from_secs(secs));
  println!("elapsed {:.2}s", rec.elapsed());
  match rec.stop() {
    Ok(s) => println!("ok: {} {}x{} @{} start {:.1}ms dur {:.0}ms moves {} clicks {} cursors {} tap {}", s.video_path.display(), s.session.width, s.session.height, s.session.scale, s.session.video_start_ms, s.session.duration_ms, s.input.moves, s.input.clicks, s.input.cursors.len(), s.input.event_tap),
    Err(e) => println!("stop failed: {e}"),
  }
}

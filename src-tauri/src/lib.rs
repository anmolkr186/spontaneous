mod agent;
mod capture;
mod project;
mod tray;
mod viewport;

use tauri::{RunEvent, WindowEvent};

#[cfg(debug_assertions)]
async fn tokio_sleep() {
  let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(1500))).await;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .manage(capture::CaptureState::default())
    .manage(agent::AgentState::default())
    .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(capture::on_shortcut).build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      tray::install(app.handle())?;
      // Every launch starts a new project: play the intro and open the recorder.
      #[cfg(not(debug_assertions))]
      capture::open_recorder(app.handle(), "display&intro=1")?;
      // Dev hooks: SPONTANEOUS_OPEN_RECORDER=display|window|area opens the recorder at launch;
      // SPONTANEOUS_AUTORECORD=<seconds> also records for that long and stops, end to end.
      #[cfg(debug_assertions)]
      if let Ok(source) = std::env::var("SPONTANEOUS_OPEN_RECORDER") {
        let auto = std::env::var("SPONTANEOUS_AUTORECORD").map(|s| format!("&autorecord={s}")).unwrap_or_default();
        capture::open_recorder(app.handle(), &format!("{source}{auto}"))?;
      } else {
        capture::open_recorder(app.handle(), "display&intro=1")?;
      }
      // Dev hook: SPONTANEOUS_OPEN_PICKER=window|area opens the on-screen picker at launch.
      #[cfg(debug_assertions)]
      if let Ok(mode) = std::env::var("SPONTANEOUS_OPEN_PICKER") {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          tokio_sleep().await;
          let display = match spontaneous_capture::sources::list() {
            Ok(s) => s.displays.into_iter().find(|d| d.is_main).map(|d| d.frame),
            Err(err) => { log::error!("dev picker: {err}"); None }
          };
          match display {
            Some(display) => if let Err(err) = capture::capture_pick(handle, mode, display).await { log::error!("dev picker: {err}"); },
            None => log::error!("dev picker: no main display"),
          }
        });
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      // Spontaneous lives in the menu bar: closing the editor hides it.
      if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      viewport::set_viewport_rect,
      capture::capture_permissions,
      capture::capture_request_permission,
      capture::capture_open_settings,
      capture::capture_sources,
      capture::capture_start,
      capture::capture_stop,
      capture::capture_discard,
      capture::capture_elapsed,
      capture::capture_last_finished,
      capture::capture_pick,
      capture::capture_window_done,
      capture::capture_area_done,
      capture::open_recorder_window,
      project::project_save,
      agent::agent_status,
      agent::agent_login,
      agent::agent_connect,
      agent::agent_send,
      agent::agent_stop,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app, event| {
    // Clicking the Dock icon with no window showing starts a new recording.
    match event {
      RunEvent::Reopen { has_visible_windows: false, .. } => { let _ = capture::open_recorder(app, "display"); }
      RunEvent::Exit => agent::shutdown(app),
      _ => {}
    }
  });
}

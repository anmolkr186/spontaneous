//! Menu bar item: the S glyph as a template image, with ways to start recording.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

use crate::capture::open_recorder;

pub fn install(app: &AppHandle) -> tauri::Result<()> {
  let display = MenuItem::with_id(app, "record-display", "Record display", true, Some("CmdOrCtrl+Shift+1"))?;
  let window = MenuItem::with_id(app, "record-window", "Record a window…", true, Some("CmdOrCtrl+Shift+2"))?;
  let area = MenuItem::with_id(app, "record-area", "Record an area…", true, Some("CmdOrCtrl+Shift+3"))?;
  let open = MenuItem::with_id(app, "open", "Open Spontaneous", true, None::<&str>)?;
  let folder = MenuItem::with_id(app, "folder", "Show recordings in Finder", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit Spontaneous", true, Some("CmdOrCtrl+Q"))?;
  let menu = Menu::with_items(
    app,
    &[&display, &window, &area, &PredefinedMenuItem::separator(app)?, &open, &folder, &PredefinedMenuItem::separator(app)?, &quit],
  )?;

  TrayIconBuilder::with_id("spontaneous")
    .icon(Image::from_bytes(include_bytes!("../icons/tray/tray@2x.png"))?)
    .icon_as_template(true)
    .tooltip("Spontaneous")
    .menu(&menu)
    .show_menu_on_left_click(true)
    .on_menu_event(|app, event| {
      let result = match event.id.as_ref() {
        "record-display" => open_recorder(app, "display"),
        "record-window" => open_recorder(app, "window"),
        "record-area" => open_recorder(app, "area"),
        "open" => show_editor(app),
        "folder" => {
          if let Ok(dir) = app.path().video_dir() {
            let dir = dir.join("Spontaneous");
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::process::Command::new("open").arg(dir).spawn();
          }
          Ok(())
        }
        "quit" => {
          app.exit(0);
          Ok(())
        }
        _ => Ok(()),
      };
      if let Err(err) = result {
        log::error!("tray action failed: {err}");
      }
    })
    .build(app)?;
  Ok(())
}

pub fn show_editor(app: &AppHandle) -> tauri::Result<()> {
  crate::capture::show_editor(app);
  Ok(())
}

use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::default()
        .targets([
          Target::new(TargetKind::LogDir { file_name: Some("app.log".into()) }),
          Target::new(TargetKind::Webview),
          Target::new(TargetKind::Stdout),
        ])
        .level(log::LevelFilter::Debug)
        .build(),
    )
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

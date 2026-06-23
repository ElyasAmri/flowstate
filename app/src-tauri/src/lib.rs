// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
use commands::{channels, flows, run};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Let a running maestro drive this app through its `desktop` tool.
            // The connector dials maestro's /ext bridge in the background and is
            // a no-op until one is running, so this is always safe to call.
            maestro_tauri_connect::attach(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            flows::project_dir,
            flows::list_flows,
            flows::read_flow,
            flows::write_flow,
            flows::write_maestro_flow,
            flows::delete_flow,
            flows::delete_maestro_flow,
            channels::list_channels,
            channels::read_channel,
            channels::write_channel,
            channels::delete_channel,
            run::run_shell,
            run::run_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

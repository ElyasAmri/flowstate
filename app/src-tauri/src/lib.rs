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
        // Restore each window's last size and position on launch, and save them
        // on exit. Registered first so it applies as windows are created.
        // Deliberately NOT restoring MAXIMIZED/FULLSCREEN: on macOS a fullscreen
        // window is its own Space, so restoring that flag onto a second monitor
        // switches that monitor's desktop. Size + position alone is what we want.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .build(),
        )
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

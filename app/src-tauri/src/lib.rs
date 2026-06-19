// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    Emitter,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Native menubar. The "View" submenu drives the frontend's
            // state-driven routing by emitting a `navigate` event whose payload
            // is the route name. App.svelte listens for it.
            let view = SubmenuBuilder::new(app, "View")
                .text("nav-home", "Home")
                .text("nav-workflows", "Workflows")
                .text("nav-documents", "Documents")
                .build()?;

            let menu = MenuBuilder::new(app).item(&view).build()?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                let route = match event.id().as_ref() {
                    "nav-home" => "home",
                    "nav-workflows" => "workflows",
                    "nav-documents" => "documents",
                    _ => return,
                };
                let _ = app.emit("navigate", route);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

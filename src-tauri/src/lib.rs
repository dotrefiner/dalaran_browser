mod commands;
mod error;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::auth::initiate_oauth_login,
            commands::auth::handle_oauth_callback,
            commands::auth::save_api_key,
            commands::auth::get_stored_credentials,
            commands::auth::clear_credentials,
            commands::webview::create_browsing_view,
            commands::webview::navigate_browsing_view,
            commands::webview::execute_in_content_script,
            commands::export::export_markdown_file,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("Error fatal iniciando Dalaran Browser: {err}");
        });
}

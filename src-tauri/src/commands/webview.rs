use crate::error::AppError;
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};

/// Valida que la URL use únicamente esquemas seguros de navegación web.
pub fn validate_navigation_url(raw_url: &str) -> Result<String, AppError> {
    let trimmed = raw_url.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::InvalidUrl(format!(
            "Solo se permiten URLs http:// o https:// (recibido: {trimmed})"
        )))
    }
}

#[tauri::command]
pub async fn create_browsing_view(
    container_id: String,
    initial_url: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let validated = validate_navigation_url(&initial_url)?;

    if let Ok(mut label) = state.active_webview_label.lock() {
        *label = Some(container_id);
    }
    if let Ok(mut url) = state.current_url.lock() {
        *url = validated;
    }

    Ok(())
}

#[tauri::command]
pub async fn navigate_browsing_view(
    url: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let validated = validate_navigation_url(&url)?;
    if let Ok(mut current) = state.current_url.lock() {
        *current = validated;
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_in_content_script(
    script_code: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let label = state
        .active_webview_label
        .lock()
        .map_err(|e| AppError::WebviewError(e.to_string()))?
        .clone();

    if let Some(target_label) = label {
        if let Some(webview) = app.get_webview(&target_label) {
            webview
                .eval(&script_code)
                .map_err(|e| AppError::WebviewError(e.to_string()))?;
        }
    }

    Ok(())
}

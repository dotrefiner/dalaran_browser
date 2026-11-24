use crate::error::AppError;
use crate::state::AppState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder,
    WebviewUrl,
};
use tauri::webview::PageLoadEvent;

/// Etiqueta única del WebView hijo que renderiza contenido web de terceros.
pub const BROWSING_WEBVIEW_LABEL: &str = "browsing";

/// Prefijos del canal de baja fidelidad basado en `document.title`.
/// Permite que el script inyectado notifique al host sin exponer IPC nativo
/// a contenido remoto (el WebView hijo no tiene acceso a `window.__TAURI__`).
const SELECTION_TITLE_PREFIX: &str = "__DALARAN_SELECTION__";
const COMMAND_TITLE_PREFIX: &str = "__DALARAN_COMMAND__";

const MAX_SELECTION_CHARS: usize = 2_000;
const MAX_CONTEXT_CHARS: usize = 600;
const MAX_EVAL_RESULT_BYTES: usize = 8_000_000;
const EVAL_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for ViewBounds {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 56.0,
            width: 1280.0,
            height: 784.0,
        }
    }
}

impl ViewBounds {
    fn sanitized(self) -> Self {
        Self {
            x: self.x.max(0.0),
            y: self.y.max(0.0),
            width: self.width.max(1.0),
            height: self.height.max(1.0),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBrowsingViewOptions {
    #[serde(default)]
    pub bounds: Option<ViewBounds>,
    #[serde(default)]
    pub init_script: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl SelectionRect {
    fn sanitized(self) -> Self {
        let finite = |value: f64| if value.is_finite() { value.max(0.0) } else { 0.0 };
        Self {
            x: finite(self.x),
            y: finite(self.y),
            width: finite(self.width),
            height: finite(self.height),
        }
    }
}

impl Default for SelectionRect {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSelectionPayload {
    pub selected_text: String,
    #[serde(default)]
    pub context_surrounding: String,
    #[serde(default)]
    pub rect: SelectionRect,
    #[serde(default)]
    pub anchor_offset: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageLoadedPayload {
    pub url: String,
    pub phase: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentScriptCommandPayload {
    pub command: String,
}

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

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Decodifica el payload de selección emitido por el script inyectado a través
/// del título del documento. Devuelve `None` si el título no es un mensaje válido.
pub fn parse_selection_title(raw_title: &str) -> Option<TextSelectionPayload> {
    let encoded = raw_title.strip_prefix(SELECTION_TITLE_PREFIX)?;
    let bytes = BASE64.decode(encoded.trim()).ok()?;
    let mut payload: TextSelectionPayload = serde_json::from_slice(&bytes).ok()?;

    payload.selected_text = truncate_chars(&payload.selected_text, MAX_SELECTION_CHARS);
    payload.context_surrounding =
        truncate_chars(&payload.context_surrounding, MAX_CONTEXT_CHARS);
    payload.rect = payload.rect.sanitized();

    if payload.selected_text.trim().is_empty() {
        return None;
    }

    Some(payload)
}

pub fn parse_command_title(raw_title: &str) -> Option<String> {
    let command = raw_title.strip_prefix(COMMAND_TITLE_PREFIX)?.trim();
    if command.is_empty() || command.len() > 64 {
        return None;
    }
    Some(command.to_string())
}

fn apply_bounds(webview: &tauri::Webview, bounds: ViewBounds) -> Result<(), AppError> {
    let b = bounds.sanitized();
    webview
        .set_position(LogicalPosition::new(b.x, b.y))
        .map_err(|e| AppError::WebviewError(e.to_string()))?;
    webview
        .set_size(LogicalSize::new(b.width, b.height))
        .map_err(|e| AppError::WebviewError(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn create_browsing_view(
    app: AppHandle,
    state: State<'_, AppState>,
    container_id: String,
    initial_url: String,
    options: Option<CreateBrowsingViewOptions>,
) -> Result<(), AppError> {
    let validated = validate_navigation_url(&initial_url)?;
    let opts = options.unwrap_or(CreateBrowsingViewOptions {
        bounds: None,
        init_script: None,
    });
    let bounds = opts.bounds.unwrap_or_default().sanitized();

    if let Ok(mut current) = state.current_url.lock() {
        *current = validated.clone();
    }
    if let Ok(mut container) = state.container_id.lock() {
        *container = Some(container_id);
    }
    if let Ok(mut label) = state.active_webview_label.lock() {
        *label = Some(BROWSING_WEBVIEW_LABEL.to_string());
    }

    // Si el WebView hijo ya existe, reutilizarlo: actualizar bounds y navegar.
    if let Some(existing) = app.get_webview(BROWSING_WEBVIEW_LABEL) {
        apply_bounds(&existing, bounds)?;
        let url = tauri::Url::parse(&validated)
            .map_err(|e| AppError::InvalidUrl(e.to_string()))?;
        existing
            .navigate(url)
            .map_err(|e| AppError::WebviewError(e.to_string()))?;
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| AppError::WebviewError(String::from("Ventana principal no disponible")))?;

    let app_for_title = app.clone();
    let app_for_load = app.clone();

    let mut builder = WebviewBuilder::new(
        BROWSING_WEBVIEW_LABEL,
        WebviewUrl::External(
            tauri::Url::parse(&validated)
                .map_err(|e| AppError::InvalidUrl(e.to_string()))?,
        ),
    )
    .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
    .on_document_title_changed(move |webview, title| {
        if let Some(payload) = parse_selection_title(&title) {
            // Restaurar el título original solo si ningún mensaje posterior lo reemplazó.
            let marker = serde_json::to_string(&title).unwrap_or_else(|_| String::from("\"\""));
            let _ = webview.eval(format!(
                "window.__dalaranRestoreTitle && window.__dalaranRestoreTitle({marker});"
            ));
            if let Err(err) = app_for_title.emit("webview-text-selection", payload) {
                eprintln!("No se pudo emitir la selección de texto: {err}");
            }
        } else if let Some(command) = parse_command_title(&title) {
            let marker = serde_json::to_string(&title).unwrap_or_else(|_| String::from("\"\""));
            let _ = webview.eval(format!(
                "window.__dalaranRestoreTitle && window.__dalaranRestoreTitle({marker});"
            ));
            if let Err(err) =
                app_for_title.emit("content-script-command", ContentScriptCommandPayload { command })
            {
                eprintln!("No se pudo emitir el comando del content script: {err}");
            }
        }
    })
    .on_page_load(move |_webview, payload| {
        if payload.event() == PageLoadEvent::Finished {
            let event = PageLoadedPayload {
                url: payload.url().to_string(),
                phase: "finished",
            };
            if let Err(err) = app_for_load.emit("webview-page-loaded", event) {
                eprintln!("No se pudo emitir la carga de página: {err}");
            }
        }
    });

    if let Some(script) = opts.init_script {
        if !script.trim().is_empty() {
            builder = builder.initialization_script(script);
        }
    }

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|e| AppError::WebviewError(e.to_string()))?;

    apply_bounds(&webview, bounds)?;
    Ok(())
}

#[tauri::command]
pub async fn set_browsing_view_bounds(
    app: AppHandle,
    bounds: ViewBounds,
) -> Result<(), AppError> {
    let webview = app
        .get_webview(BROWSING_WEBVIEW_LABEL)
        .ok_or_else(|| AppError::WebviewError(String::from("WebView de navegación inactivo")))?;
    apply_bounds(&webview, bounds)
}

#[tauri::command]
pub async fn navigate_browsing_view(
    app: AppHandle,
    url: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let validated = validate_navigation_url(&url)?;
    if let Ok(mut current) = state.current_url.lock() {
        *current = validated.clone();
    }

    let webview = app
        .get_webview(BROWSING_WEBVIEW_LABEL)
        .ok_or_else(|| AppError::WebviewError(String::from("WebView de navegación inactivo")))?;
    let parsed = tauri::Url::parse(&validated)
        .map_err(|e| AppError::InvalidUrl(e.to_string()))?;
    webview
        .navigate(parsed)
        .map_err(|e| AppError::WebviewError(e.to_string()))?;
    Ok(())
}

/// Ejecuta código en el content script del WebView de navegación y devuelve
/// el resultado serializado a JSON (útil para extraer el DOM de la página).
#[tauri::command]
pub async fn execute_in_content_script(
    app: AppHandle,
    script_code: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    if script_code.trim().is_empty() {
        return Err(AppError::WebviewError(String::from(
            "El código a ejecutar está vacío",
        )));
    }

    let label = state
        .active_webview_label
        .lock()
        .map_err(|e| AppError::WebviewError(e.to_string()))?
        .clone()
        .unwrap_or_else(|| BROWSING_WEBVIEW_LABEL.to_string());

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| AppError::WebviewError(String::from("WebView de navegación inactivo")))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let sender = std::sync::Mutex::new(Some(tx));
    webview
        .eval_with_callback(script_code, move |result| {
            if let Ok(mut guard) = sender.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(result);
                }
            }
        })
        .map_err(|e| AppError::WebviewError(e.to_string()))?;

    let raw = tokio::time::timeout(EVAL_TIMEOUT, rx)
        .await
        .map_err(|_| {
            AppError::WebviewError(String::from(
                "Timeout esperando la respuesta del content script",
            ))
        })?
        .map_err(|_| {
            AppError::WebviewError(String::from(
                "El content script cerró el canal de respuesta",
            ))
        })?;

    if raw.len() > MAX_EVAL_RESULT_BYTES {
        return Err(AppError::WebviewError(format!(
            "Respuesta del content script demasiado grande ({} bytes)",
            raw.len()
        )));
    }

    Ok(serde_json::from_str(&raw).unwrap_or(serde_json::Value::String(raw)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tc_runtime_01_rejects_non_http_schemes() {
        assert!(validate_navigation_url("javascript:alert(1)").is_err());
        assert!(validate_navigation_url("file:///etc/passwd").is_err());
        assert!(validate_navigation_url("tauri://localhost").is_err());
        assert_eq!(
            validate_navigation_url("https://example.com").ok(),
            Some(String::from("https://example.com"))
        );
    }

    #[test]
    fn tc_runtime_02_decodes_and_clamps_selection_payload() {
        let payload = TextSelectionPayload {
            selected_text: "x".repeat(MAX_SELECTION_CHARS + 100),
            context_surrounding: "y".repeat(MAX_CONTEXT_CHARS + 100),
            rect: SelectionRect {
                x: -12.0,
                y: -5.0,
                width: 10.0,
                height: 20.0,
            },
            anchor_offset: 7,
            action: Some(String::from("define")),
        };
        let json = serde_json::to_vec(&payload).expect("serialización válida");
        let title = format!("{SELECTION_TITLE_PREFIX}{}", BASE64.encode(json));

        let decoded = parse_selection_title(&title).expect("payload decodificable");
        assert_eq!(decoded.selected_text.chars().count(), MAX_SELECTION_CHARS);
        assert_eq!(
            decoded.context_surrounding.chars().count(),
            MAX_CONTEXT_CHARS
        );
        assert_eq!(decoded.rect.x, 0.0);
        assert_eq!(decoded.rect.y, 0.0);
        assert_eq!(decoded.action.as_deref(), Some("define"));
    }

    #[test]
    fn tc_runtime_03_ignores_regular_titles_and_invalid_payloads() {
        assert!(parse_selection_title("Mi página favorita").is_none());
        assert!(parse_selection_title("__DALARAN_SELECTION__@@@no-base64@@@").is_none());
        assert!(parse_command_title("Mi página favorita").is_none());
        assert_eq!(
            parse_command_title("__DALARAN_COMMAND__focus-url").as_deref(),
            Some("focus-url")
        );
    }
}

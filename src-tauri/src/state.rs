use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentials {
    pub access_token: Option<String>,
    pub api_key: Option<String>,
    pub user_email: Option<String>,
}

/// Datos efímeros del flujo OAuth 2.0 PKCE en curso.
#[derive(Debug, Clone)]
pub struct PendingOAuth {
    pub verifier: String,
    pub redirect_uri: String,
    pub state: String,
    pub created_at: std::time::Instant,
}

pub struct AppState {
    pub current_url: Mutex<String>,
    pub active_webview_label: Mutex<Option<String>>,
    pub container_id: Mutex<Option<String>>,
    pub cached_credentials: Mutex<StoredCredentials>,
    pub pending_oauth: Mutex<Option<PendingOAuth>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_url: Mutex::new(String::from("about:blank")),
            active_webview_label: Mutex::new(None),
            container_id: Mutex::new(None),
            cached_credentials: Mutex::new(StoredCredentials::default()),
            pending_oauth: Mutex::new(None),
        }
    }
}

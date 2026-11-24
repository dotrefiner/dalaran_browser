use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentials {
    pub access_token: Option<String>,
    pub api_key: Option<String>,
    pub user_email: Option<String>,
}

pub struct AppState {
    pub current_url: Mutex<String>,
    pub active_webview_label: Mutex<Option<String>>,
    pub cached_credentials: Mutex<StoredCredentials>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_url: Mutex::new(String::from("about:blank")),
            active_webview_label: Mutex::new(None),
            cached_credentials: Mutex::new(StoredCredentials::default()),
        }
    }
}

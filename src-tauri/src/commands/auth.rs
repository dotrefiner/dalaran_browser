use crate::error::AppError;
use crate::state::{AppState, StoredCredentials};
use keyring::Entry;
use serde::Serialize;
use tauri::State;

const KEYRING_SERVICE: &str = "com.dalaran.browser";
const KEY_ACCESS_TOKEN: &str = "oauth_access_token";
const KEY_API_KEY: &str = "gemini_api_key";
const KEY_USER_EMAIL: &str = "user_email";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthInitResponse {
    pub auth_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthCallbackResponse {
    pub access_token: String,
    pub user_email: String,
}

fn set_secret(account: &str, value: &str) -> Result<(), AppError> {
    let entry = Entry::new(KEYRING_SERVICE, account)
        .map_err(|e| AppError::KeyringError(e.to_string()))?;
    entry
        .set_password(value)
        .map_err(|e| AppError::KeyringError(e.to_string()))
}

fn get_secret(account: &str) -> Option<String> {
    Entry::new(KEYRING_SERVICE, account)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

fn delete_secret(account: &str) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, account) {
        let _ = entry.delete_credential();
    }
}

#[tauri::command]
pub async fn initiate_oauth_login() -> Result<OAuthInitResponse, AppError> {
    // En producción, se genera code_verifier / code_challenge PKCE y un listener loopback 127.0.0.1:<PORT>.
    let auth_url = String::from(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&scope=openid%20email",
    );
    Ok(OAuthInitResponse { auth_url })
}

#[tauri::command]
pub async fn handle_oauth_callback(
    code: String,
    state: State<'_, AppState>,
) -> Result<OAuthCallbackResponse, AppError> {
    if code.trim().is_empty() {
        return Err(AppError::AuthError(String::from(
            "Código de autorización OAuth vacío",
        )));
    }

    // Intercambio de código PKCE por token en endpoints de Google OAuth (placeholder estructural V1)
    let access_token = format!("oauth-session-{code}");
    let user_email = String::from("usuario@dalaran.local");

    set_secret(KEY_ACCESS_TOKEN, &access_token)?;
    set_secret(KEY_USER_EMAIL, &user_email)?;

    if let Ok(mut creds) = state.cached_credentials.lock() {
        creds.access_token = Some(access_token.clone());
        creds.user_email = Some(user_email.clone());
    }

    Ok(OAuthCallbackResponse {
        access_token,
        user_email,
    })
}

#[tauri::command]
pub async fn save_api_key(api_key: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AppError::AuthError(String::from("API Key vacía")));
    }

    set_secret(KEY_API_KEY, trimmed)?;

    if let Ok(mut creds) = state.cached_credentials.lock() {
        creds.api_key = Some(trimmed.to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn get_stored_credentials(
    state: State<'_, AppState>,
) -> Result<StoredCredentials, AppError> {
    let creds = StoredCredentials {
        access_token: get_secret(KEY_ACCESS_TOKEN),
        api_key: get_secret(KEY_API_KEY),
        user_email: get_secret(KEY_USER_EMAIL),
    };

    if let Ok(mut cached) = state.cached_credentials.lock() {
        *cached = creds.clone();
    }

    Ok(creds)
}

#[tauri::command]
pub async fn clear_credentials(state: State<'_, AppState>) -> Result<(), AppError> {
    delete_secret(KEY_ACCESS_TOKEN);
    delete_secret(KEY_API_KEY);
    delete_secret(KEY_USER_EMAIL);

    if let Ok(mut creds) = state.cached_credentials.lock() {
        *creds = StoredCredentials::default();
    }

    Ok(())
}

use crate::error::AppError;
use crate::state::{AppState, PendingOAuth, StoredCredentials};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

const KEYRING_SERVICE: &str = "com.dalaran.browser";
const KEY_ACCESS_TOKEN: &str = "oauth_access_token";
const KEY_API_KEY: &str = "gemini_api_key";
const KEY_USER_EMAIL: &str = "user_email";

const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE: &str =
    "openid email profile https://www.googleapis.com/auth/generative-language.retriever";
const OAUTH_TIMEOUT: Duration = Duration::from_secs(120);
const OAUTH_PENDING_TTL: Duration = Duration::from_secs(600);
const MAX_CALLBACK_REQUEST_BYTES: usize = 16 * 1024;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResultPayload {
    pub success: bool,
    pub access_token: Option<String>,
    pub user_email: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
}

fn set_secret(account: &str, value: &str) -> Result<(), AppError> {
    let entry =
        Entry::new(KEYRING_SERVICE, account).map_err(|e| AppError::KeyringError(e.to_string()))?;
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

/// OAuth Client ID de Google. Se configura por variable de entorno para no
/// incrustar credenciales de proyecto en el binario.
fn google_client_id() -> Result<String, AppError> {
    std::env::var("DALARAN_GOOGLE_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            option_env!("DALARAN_GOOGLE_CLIENT_ID")
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty())
        })
        .ok_or_else(|| {
            AppError::AuthError(String::from(
                "Configura la variable de entorno DALARAN_GOOGLE_CLIENT_ID para habilitar OAuth. \
                 Puedes seguir usando BYOK con una API Key de Google AI Studio.",
            ))
        })
}

fn random_urlsafe_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Genera el `code_verifier` PKCE (RFC 7636): 32 bytes aleatorios en base64url.
pub fn generate_code_verifier() -> String {
    random_urlsafe_token()
}

/// `code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))`.
pub fn derive_code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

pub fn build_auth_url(
    client_id: &str,
    redirect_uri: &str,
    code_challenge: &str,
    csrf_state: &str,
) -> Result<String, AppError> {
    let mut url = Url::parse(GOOGLE_AUTH_ENDPOINT)
        .map_err(|e| AppError::AuthError(format!("Endpoint OAuth inválido: {e}")))?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", OAUTH_SCOPE)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", csrf_state)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    Ok(url.to_string())
}

/// Extrae y valida los parámetros del callback OAuth a partir del target HTTP
/// (`/oauth/callback?code=...&state=...`).
pub fn parse_callback_target(target: &str) -> Result<(CallbackParams, String), AppError> {
    let url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|e| AppError::AuthError(format!("Callback OAuth inválido: {e}")))?;

    if url.path() != "/oauth/callback" {
        return Err(AppError::AuthError(String::from(
            "Ruta de callback OAuth inesperada",
        )));
    }

    let mut params = CallbackParams::default();
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => params.code = Some(value.into_owned()),
            "state" => params.state = Some(value.into_owned()),
            "error" => params.error = Some(value.into_owned()),
            "error_description" => params.error_description = Some(value.into_owned()),
            _ => {}
        }
    }

    Ok((params, url.path().to_string()))
}

pub fn validate_callback(params: CallbackParams, expected_state: &str) -> Result<String, AppError> {
    if let Some(error) = params.error {
        let description = params
            .error_description
            .unwrap_or_else(|| String::from("sin descripción"));
        return Err(AppError::AuthError(format!(
            "Google OAuth devolvió un error: {error} ({description})"
        )));
    }

    let received_state = params
        .state
        .ok_or_else(|| AppError::AuthError(String::from("Callback OAuth sin parámetro state")))?;
    if received_state != expected_state {
        return Err(AppError::AuthError(String::from(
            "Parámetro state inválido: posible ataque CSRF",
        )));
    }

    params
        .code
        .filter(|code| !code.trim().is_empty())
        .ok_or_else(|| AppError::AuthError(String::from("Callback OAuth sin código de autorización")))
}

/// Decodifica el claim `email` del `id_token` JWT (sin verificar firma: la
/// autenticidad ya la garantiza el intercambio TLS directo con Google).
pub fn decode_id_token_email(id_token: &str) -> Option<String> {
    let payload_segment = id_token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload_segment).ok()?;

    #[derive(Deserialize)]
    struct IdTokenClaims {
        email: Option<String>,
    }

    let claims: IdTokenClaims = serde_json::from_slice(&decoded).ok()?;
    claims.email.filter(|email| !email.trim().is_empty())
}

fn persist_oauth_session(
    state: &AppState,
    access_token: &str,
    user_email: &str,
) -> Result<(), AppError> {
    set_secret(KEY_ACCESS_TOKEN, access_token)?;
    set_secret(KEY_USER_EMAIL, user_email)?;

    if let Ok(mut creds) = state.cached_credentials.lock() {
        creds.access_token = Some(access_token.to_string());
        creds.user_email = Some(user_email.to_string());
    }

    Ok(())
}

async fn exchange_code(
    client_id: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthCallbackResponse, AppError> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::AuthError(format!("No se pudo crear el cliente HTTP: {e}")))?;

    let response = http
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&[
            ("client_id", client_id),
            ("code", code),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| AppError::AuthError(format!("Fallo de red en el intercambio OAuth: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let safe_body: String = body.chars().take(500).collect();
        return Err(AppError::AuthError(format!(
            "Google rechazó el intercambio OAuth ({status}): {safe_body}"
        )));
    }

    let token: TokenResponse = response
        .json()
        .await
        .map_err(|e| AppError::AuthError(format!("Respuesta de token inválida: {e}")))?;

    if token.access_token.trim().is_empty() {
        return Err(AppError::AuthError(String::from(
            "Google devolvió un access token vacío",
        )));
    }

    // El refresh token se conserva en el llavero para futuras renovaciones.
    if let Some(refresh_token) = token.refresh_token.as_deref() {
        if !refresh_token.trim().is_empty() {
            set_secret("oauth_refresh_token", refresh_token)?;
        }
    }

    let user_email = token
        .id_token
        .as_deref()
        .and_then(decode_id_token_email)
        .unwrap_or_else(|| String::from("usuario@google"));

    Ok(OAuthCallbackResponse {
        access_token: token.access_token,
        user_email,
    })
}

const CALLBACK_HTML_SUCCESS: &str = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Dalaran Browser</title></head><body style=\"font-family:system-ui;background:#0f1115;color:#e4e7ec;display:grid;place-items:center;height:100vh;margin:0\"><main style=\"text-align:center\"><h1>Autenticación completada</h1><p>Ya puedes cerrar esta ventana y volver a Dalaran Browser.</p></main></body></html>";

const CALLBACK_HTML_ERROR: &str = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Dalaran Browser</title></head><body style=\"font-family:system-ui;background:#0f1115;color:#e4e7ec;display:grid;place-items:center;height:100vh;margin:0\"><main style=\"text-align:center\"><h1>No se pudo completar la autenticación</h1><p>Vuelve a Dalaran Browser e inténtalo de nuevo.</p></main></body></html>";

async fn write_callback_response(
    stream: &mut tokio::net::TcpStream,
    body: &str,
) -> Result<(), AppError> {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| AppError::AuthError(format!("No se pudo responder al callback OAuth: {e}")))?;
    let _ = stream.shutdown().await;
    Ok(())
}

async fn wait_for_callback(
    listener: TcpListener,
    expected_state: &str,
) -> Result<String, AppError> {
    let accepted = tokio::time::timeout(OAUTH_TIMEOUT, listener.accept())
        .await
        .map_err(|_| {
            AppError::AuthError(String::from(
                "Tiempo de espera OAuth agotado (120 s). Inténtalo de nuevo.",
            ))
        })?
        .map_err(|e| AppError::AuthError(format!("Listener OAuth falló: {e}")))?;

    let (mut stream, _peer) = accepted;
    let mut buffer = vec![0u8; MAX_CALLBACK_REQUEST_BYTES];
    let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buffer))
        .await
        .map_err(|_| AppError::AuthError(String::from("Callback OAuth incompleto")))?
        .map_err(|e| AppError::AuthError(format!("No se pudo leer el callback OAuth: {e}")))?;

    let request = String::from_utf8_lossy(&buffer[..read]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| AppError::AuthError(String::from("Petición HTTP de callback inválida")))?;

    let result = parse_callback_target(target).and_then(|(params, _)| {
        // Guardar el resultado de validación antes de responder, para no
        // reflejar detalles sensibles del error en el navegador.
        validate_callback(params, expected_state)
    });

    let body = if result.is_ok() {
        CALLBACK_HTML_SUCCESS
    } else {
        CALLBACK_HTML_ERROR
    };
    write_callback_response(&mut stream, body).await?;

    result
}

#[tauri::command]
pub async fn initiate_oauth_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<OAuthInitResponse, AppError> {
    let client_id = google_client_id()?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| AppError::AuthError(format!("No se pudo abrir el listener OAuth: {e}")))?;
    let address = listener
        .local_addr()
        .map_err(|e| AppError::AuthError(format!("Listener OAuth sin dirección: {e}")))?;
    let redirect_uri = format!("http://127.0.0.1:{}/oauth/callback", address.port());

    let verifier = generate_code_verifier();
    let challenge = derive_code_challenge(&verifier);
    let csrf_state = random_urlsafe_token();
    let auth_url = build_auth_url(&client_id, &redirect_uri, &challenge, &csrf_state)?;

    {
        let mut pending = state
            .pending_oauth
            .lock()
            .map_err(|e| AppError::AuthError(e.to_string()))?;
        *pending = Some(PendingOAuth {
            verifier: verifier.clone(),
            redirect_uri: redirect_uri.clone(),
            state: csrf_state.clone(),
            created_at: Instant::now(),
        });
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let callback = wait_for_callback(listener, &csrf_state).await;
        let result = match callback {
            Ok(code) => {
                exchange_code(&client_id, &code, &verifier, &redirect_uri)
                    .await
                    .and_then(|tokens| {
                        let state = app_handle.state::<AppState>();
                        persist_oauth_session(&state, &tokens.access_token, &tokens.user_email)?;
                        Ok(tokens)
                    })
            }
            Err(err) => Err(err),
        };

        {
            let state = app_handle.state::<AppState>();
            if let Ok(mut pending) = state.pending_oauth.lock() {
                *pending = None;
            }
        }

        let payload = match result {
            Ok(tokens) => OAuthResultPayload {
                success: true,
                access_token: Some(tokens.access_token),
                user_email: Some(tokens.user_email),
                error: None,
            },
            Err(err) => OAuthResultPayload {
                success: false,
                access_token: None,
                user_email: None,
                error: Some(err.to_string()),
            },
        };

        if let Err(err) = app_handle.emit("oauth-login-result", payload) {
            eprintln!("No se pudo emitir el resultado OAuth: {err}");
        }
    });

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

    let client_id = google_client_id()?;
    let pending = {
        let guard = state
            .pending_oauth
            .lock()
            .map_err(|e| AppError::AuthError(e.to_string()))?;
        guard
            .clone()
            .ok_or_else(|| AppError::AuthError(String::from("No hay flujo OAuth pendiente")))?
    };

    if pending.created_at.elapsed() > OAUTH_PENDING_TTL {
        return Err(AppError::AuthError(String::from(
            "El flujo OAuth pendiente expiró; inicia sesión de nuevo",
        )));
    }

    let tokens = exchange_code(
        &client_id,
        &code,
        &pending.verifier,
        &pending.redirect_uri,
    )
    .await?;
    persist_oauth_session(&state, &tokens.access_token, &tokens.user_email)?;

    if let Ok(mut guard) = state.pending_oauth.lock() {
        *guard = None;
    }

    Ok(tokens)
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), AppError> {
    let validated = crate::commands::webview::validate_navigation_url(&url)?;
    open::that(validated).map_err(|e| AppError::IoError(format!("No se pudo abrir el navegador: {e}")))
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
    delete_secret("oauth_refresh_token");

    if let Ok(mut creds) = state.cached_credentials.lock() {
        *creds = StoredCredentials::default();
    }
    if let Ok(mut pending) = state.pending_oauth.lock() {
        *pending = None;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tc_auth_pkce_matches_rfc7636_vector() {
        // Vector de prueba oficial del Apéndice B de RFC 7636.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            derive_code_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn tc_auth_generates_verifier_with_required_entropy_and_charset() {
        let verifier = generate_code_verifier();
        assert_eq!(verifier.len(), 43);
        assert!(verifier
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(verifier, generate_code_verifier());
    }

    #[test]
    fn tc_auth_builds_authorization_url_with_pkce_and_state() {
        let url = build_auth_url(
            "client-id.apps.googleusercontent.com",
            "http://127.0.0.1:45999/oauth/callback",
            "challenge-123",
            "csrf-456",
        )
        .expect("URL OAuth válida");

        let parsed = Url::parse(&url).expect("URL parseable");
        let params: std::collections::HashMap<_, _> =
            parsed.query_pairs().into_owned().collect();

        assert_eq!(
            params.get("client_id").map(String::as_str),
            Some("client-id.apps.googleusercontent.com")
        );
        assert_eq!(params.get("response_type").map(String::as_str), Some("code"));
        assert_eq!(
            params.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(
            params.get("code_challenge").map(String::as_str),
            Some("challenge-123")
        );
        assert_eq!(params.get("state").map(String::as_str), Some("csrf-456"));
        assert!(params
            .get("scope")
            .is_some_and(|scope| scope.contains("openid")));
    }

    #[test]
    fn tc_auth_parses_and_validates_callback_target() {
        let target = "/oauth/callback?code=abc123&state=csrf-456";
        let (params, path) = parse_callback_target(target).expect("callback válido");
        assert_eq!(path, "/oauth/callback");
        assert_eq!(validate_callback(params, "csrf-456").ok(), Some(String::from("abc123")));

        let (bad_params, _) = parse_callback_target(target).expect("callback válido");
        assert!(validate_callback(bad_params, "otro-state").is_err());
    }

    #[test]
    fn tc_auth_reports_oauth_errors_without_accepting_codes() {
        let (params, _) =
            parse_callback_target("/oauth/callback?error=access_denied&error_description=denegado")
                .expect("callback válido");
        let err = validate_callback(params, "csrf").expect_err("debe rechazar");
        assert!(err.to_string().contains("access_denied"));

        let (missing_code, _) = parse_callback_target("/oauth/callback?state=csrf")
            .expect("callback válido");
        assert!(validate_callback(missing_code, "csrf").is_err());

        assert!(parse_callback_target("/evil/path?code=x").is_err());
    }

    #[test]
    fn tc_auth_decodes_email_from_id_token_payload() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"lector@example.com","sub":"123"}"#);
        let token = format!("header.{payload}.signature");
        assert_eq!(
            decode_id_token_email(&token).as_deref(),
            Some("lector@example.com")
        );
        assert!(decode_id_token_email("token-invalido").is_none());
    }
}

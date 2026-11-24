use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("Ruta inválida o no permitida: {0}")]
    InvalidPath(String),
    #[error("URL inválida o esquema no soportado: {0}")]
    InvalidUrl(String),
    #[error("Error de autenticación: {0}")]
    AuthError(String),
    #[error("Error de almacenamiento seguro: {0}")]
    KeyringError(String),
    #[error("Error de sistema de archivos: {0}")]
    IoError(String),
    #[error("Error interno de WebView: {0}")]
    WebviewError(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err.to_string())
    }
}

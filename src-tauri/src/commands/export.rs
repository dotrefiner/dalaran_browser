use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMarkdownOptions {
    pub filename: String,
    pub content: String,
    pub suggested_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub file_path: Option<String>,
}

/// Sanitiza el nombre de archivo para evitar secuencias de Path Traversal.
pub fn validate_export_filename(filename: &str) -> Result<String, AppError> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath(String::from(
            "Nombre de archivo vacío",
        )));
    }

    let path = Path::new(trimmed);
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => {
                return Err(AppError::InvalidPath(format!(
                    "Nombre de archivo contiene componentes prohibidos: {trimmed}"
                )));
            }
        }
    }

    if path.components().count() != 1 {
        return Err(AppError::InvalidPath(format!(
            "Solo se permite un nombre de archivo simple sin subdirectorios: {trimmed}"
        )));
    }

    Ok(trimmed.to_string())
}

/// Verifica que la ruta final resuelta permanezca estrictamente dentro de `allowed_root`.
pub fn validate_export_path(target_path: &Path, allowed_root: &Path) -> Result<PathBuf, AppError> {
    let canonical_root = std::fs::canonicalize(allowed_root)
        .map_err(|_| AppError::InvalidPath(String::from("Directorio raíz inválido")))?;

    let parent = target_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath(String::from("Ruta sin directorio padre")))?;

    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|_| AppError::InvalidPath(String::from("Directorio destino inexistente")))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err(AppError::InvalidPath(String::from(
            "Intento de Path Traversal bloqueado fuera del directorio permitido",
        )));
    }

    let file_name = target_path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(String::from("Nombre de archivo faltante")))?;

    Ok(canonical_parent.join(file_name))
}

#[tauri::command]
pub async fn export_markdown_file(
    app: AppHandle,
    options: ExportMarkdownOptions,
) -> Result<ExportResult, AppError> {
    let safe_filename = validate_export_filename(&options.filename)?;

    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&safe_filename)
        .add_filter("Markdown", &["md"]);

    if let Some(ref dir) = options.suggested_directory {
        dialog = dialog.set_directory(dir);
    }

    let picked = dialog.blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(ExportResult {
            success: false,
            file_path: None,
        });
    };

    let resolved = file_path
        .into_path()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;

    if let Some(parent) = resolved.parent() {
        let safe_path = validate_export_path(&resolved, parent)?;
        std::fs::write(&safe_path, options.content.as_bytes())?;
        return Ok(ExportResult {
            success: true,
            file_path: Some(safe_path.to_string_lossy().to_string()),
        });
    }

    Err(AppError::InvalidPath(String::from(
        "Ruta de exportación sin directorio padre válido",
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tc_rust_01_blocks_path_traversal_filenames() {
        assert!(validate_export_filename("../../etc/passwd").is_err());
        assert!(validate_export_filename("/etc/shadow").is_err());
        assert!(validate_export_filename("subdir/nota.md").is_err());
        assert!(validate_export_filename("").is_err());
        assert_eq!(
            validate_export_filename("notas-lectura.md").ok(),
            Some(String::from("notas-lectura.md"))
        );
    }

    #[test]
    fn tc_rust_01_blocks_escape_outside_allowed_root() {
        let temp = std::env::temp_dir();
        let outside = Path::new("/etc/passwd");
        assert!(validate_export_path(outside, &temp).is_err());
    }
}

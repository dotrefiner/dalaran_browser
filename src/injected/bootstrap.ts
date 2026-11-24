import type { TextSelectionPayload } from '../platform/bridge';
import { initContentScript } from './content-script';

/**
 * Canal de notificación de baja fidelidad entre el WebView de navegación
 * (contenido remoto, sin acceso a IPC nativo) y el host Tauri.
 *
 * El script inyectado escribe un mensaje codificado en `document.title`; Rust
 * lo intercepta con `on_document_title_changed`, restaura el título original
 * y reemite el evento a la Shell UI. Así el contenido remoto nunca recibe
 * acceso a `window.__TAURI__` ni a comandos nativos.
 */
const SELECTION_TITLE_PREFIX = '__DALARAN_SELECTION__';
const COMMAND_TITLE_PREFIX = '__DALARAN_COMMAND__';
const MAX_SELECTED_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 600;

declare global {
  interface Window {
    __dalaranRealTitle?: string;
    __dalaranContentScriptReady?: boolean;
    __dalaranRestoreTitle?: (marker: string) => void;
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function stashRealTitle(): void {
  if (typeof window.__dalaranRealTitle === 'string') return;
  if (
    document.title.startsWith(SELECTION_TITLE_PREFIX) ||
    document.title.startsWith(COMMAND_TITLE_PREFIX)
  ) {
    return;
  }
  window.__dalaranRealTitle = document.title;
}

function restoreTitle(marker: string): void {
  if (document.title !== marker) return;
  document.title = window.__dalaranRealTitle ?? '';
  delete window.__dalaranRealTitle;
}

function publishTitle(prefix: string, encoded: string): void {
  stashRealTitle();
  const marker = `${prefix}${encoded}`;
  document.title = marker;

  // Red de seguridad: si el host no responde (p. ej. WebView en segundo plano),
  // evitar dejar el título de la página contaminado de forma permanente.
  window.setTimeout(() => {
    if (document.title === marker) {
      restoreTitle(marker);
    }
  }, 2_000);
}

function sendCommand(command: string): void {
  publishTitle(COMMAND_TITLE_PREFIX, command);
}

function emitSelection(payload: TextSelectionPayload): void {
  const safePayload = {
    selectedText: payload.selectedText.slice(0, MAX_SELECTED_CHARS),
    contextSurrounding: payload.contextSurrounding.slice(0, MAX_CONTEXT_CHARS),
    rect: {
      x: Number.isFinite(payload.rect.x) ? payload.rect.x : 0,
      y: Number.isFinite(payload.rect.y) ? payload.rect.y : 0,
      width: Number.isFinite(payload.rect.width) ? payload.rect.width : 0,
      height: Number.isFinite(payload.rect.height) ? payload.rect.height : 0,
    },
    anchorOffset: Number.isFinite(payload.anchorOffset) ? payload.anchorOffset : 0,
    action: payload.action,
  };

  publishTitle(SELECTION_TITLE_PREFIX, toBase64(JSON.stringify(safePayload)));
}

if (!window.__dalaranContentScriptReady) {
  window.__dalaranContentScriptReady = true;
  window.__dalaranRestoreTitle = restoreTitle;

  initContentScript({
    emitSelection,
    toggleSmartModeShortcut: () => sendCommand('smart-toggle'),
    focusUrlBarShortcut: () => sendCommand('focus-url'),
  });
}

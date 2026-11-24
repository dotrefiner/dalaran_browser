import { useEffect, useRef } from 'preact/hooks';
import {
  currentUrl,
  focusUrlBarRequest,
  isIncognito,
  isSensitivePaused,
  lastRedactedPiiCount,
  sensitiveReason,
  smartModeEnabled,
} from '../store/session-store';

export interface BrowserBarProps {
  onNavigate: (url: string) => void;
  onToggleSmartMode: (enable: boolean) => void;
  onOpenAuthModal: () => void;
}

export function BrowserBar({
  onNavigate,
  onToggleSmartMode,
  onOpenAuthModal,
}: BrowserBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusUrlBarRequest.value > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusUrlBarRequest.value]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const val = inputRef.current?.value.trim() ?? currentUrl.value;
    if (val) {
      const normalized = /^https?:\/\//i.test(val) ? val : `https://${val}`;
      currentUrl.value = normalized;
      onNavigate(normalized);
    }
  };

  return (
    <header class="browser-bar">
      <form class="url-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="url"
          class="url-input"
          value={currentUrl.value}
          aria-label="Barra de direcciones"
          placeholder="https://..."
        />
        <button type="submit" class="nav-btn">
          Ir
        </button>
      </form>

      <div class="bar-controls">
        {isSensitivePaused.value && (
          <span
            class="privacy-badge paused"
            title={
              sensitiveReason.value ||
              'Smart Mode en pausa: Página con contenido sensible/credenciales'
            }
          >
            🔒 Smart Mode en pausa
          </span>
        )}

        {lastRedactedPiiCount.value > 0 && (
          <span
            class="privacy-badge scrubbed"
            title="Se enmascararon datos personales antes del análisis"
          >
            🛡️ {lastRedactedPiiCount.value} PII protegidos
          </span>
        )}

        <button
          type="button"
          class={`toggle-btn ${isIncognito.value ? 'active' : ''}`}
          onClick={() => {
            isIncognito.value = !isIncognito.value;
          }}
          title="Modo Incógnito / Efímero (sin escritura en disco)"
        >
          {isIncognito.value ? '🕶️ Incógnito' : 'Normal'}
        </button>

        <button
          type="button"
          class={`smart-toggle ${smartModeEnabled.value ? 'enabled' : ''}`}
          aria-pressed={smartModeEnabled.value}
          onClick={() => onToggleSmartMode(!smartModeEnabled.value)}
          title="Activar/Pausar Smart Mode (Alt+S)"
        >
          ✦ Smart Mode: {smartModeEnabled.value ? 'ON' : 'OFF'}
        </button>

        <button type="button" class="auth-btn" onClick={onOpenAuthModal}>
          Cuenta / Key
        </button>
      </div>
    </header>
  );
}

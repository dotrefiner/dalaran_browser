import { useState } from 'preact/hooks';
import { showOnboardingModal } from '../store/session-store';

export interface OnboardingModalProps {
  onGoogleLogin: () => void;
  onSaveApiKey: (apiKey: string) => Promise<void>;
}

export function OnboardingModal({ onGoogleLogin, onSaveApiKey }: OnboardingModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!showOnboardingModal.value) return null;

  const handleKeySubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (!apiKeyInput.trim()) {
      setError('Ingresa una API Key válida de Google AI Studio.');
      return;
    }
    try {
      await onSaveApiKey(apiKeyInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando API Key');
    }
  };

  return (
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configurar Smart Mode">
      <div class="modal-card">
        <h2>Bienvenido a Dalaran Browser</h2>
        <p>
          Para habilitar la lectura asistida (definiciones, traducción y debate contextual con
          Gemini), inicia sesión con Google o configura tu propia API Key (BYOK).
        </p>

        <div class="modal-actions">
          <button type="button" class="primary-btn" onClick={onGoogleLogin}>
            Iniciar sesión con Google (OAuth 2.0)
          </button>
        </div>

        <form class="byok-form" onSubmit={handleKeySubmit}>
          <label for="byok-input">O usar API Key propia (BYOK):</label>
          <div class="byok-row">
            <input
              id="byok-input"
              type="password"
              value={apiKeyInput}
              onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
              placeholder="AIza..."
            />
            <button type="submit">Guardar Key</button>
          </div>
          {error && <p class="error-text">{error}</p>}
        </form>

        <button
          type="button"
          class="ghost-btn"
          onClick={() => {
            showOnboardingModal.value = false;
          }}
        >
          Omitir y navegar en modo estándar
        </button>
      </div>
    </div>
  );
}

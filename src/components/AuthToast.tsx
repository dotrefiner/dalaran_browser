import { showAuthToast, showOnboardingModal } from '../store/session-store';

export interface AuthToastProps {
  onGoogleLogin: () => void;
}

export function AuthToast({ onGoogleLogin }: AuthToastProps) {
  if (!showAuthToast.value) return null;

  return (
    <div class="auth-toast" role="alert">
      <div class="toast-content">
        <strong>Smart Mode requiere autenticación</strong>
        <span>Inicia sesión con Google o ingresa una API Key para activar la IA.</span>
      </div>
      <div class="toast-actions">
        <button type="button" class="primary-btn" onClick={onGoogleLogin}>
          Iniciar sesión con Google
        </button>
        <button
          type="button"
          onClick={() => {
            showAuthToast.value = false;
            showOnboardingModal.value = true;
          }}
        >
          Ingresar API Key (BYOK)
        </button>
        <button
          type="button"
          class="ghost-btn"
          onClick={() => {
            showAuthToast.value = false;
          }}
        >
          Seguir en modo clásico
        </button>
      </div>
    </div>
  );
}

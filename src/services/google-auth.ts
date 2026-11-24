import type { IPlatformBridge, StoredCredentials } from '../platform/bridge';
import {
  authError,
  credentials,
  isAuthenticated,
  showAuthToast,
  showOnboardingModal,
  smartModeEnabled,
} from '../store/session-store';

export class GoogleAuthService {
  constructor(private readonly bridge: IPlatformBridge) {}

  async initialize(): Promise<StoredCredentials> {
    const stored = await this.bridge.getStoredCredentials();
    credentials.value = stored;

    if (!stored.accessToken && !stored.apiKey) {
      showOnboardingModal.value = true;
    }

    return stored;
  }

  /**
   * Se suscribe al resultado que emite el listener loopback OAuth de Rust.
   * Debe invocarse una sola vez al montar la Shell y limpiarse al desmontar.
   */
  watchOAuthResult(): () => void {
    return this.bridge.onOAuthLoginResult((result) => {
      if (result.success && result.accessToken) {
        credentials.value = {
          ...credentials.value,
          accessToken: result.accessToken,
          userEmail: result.userEmail,
        };
        authError.value = null;
        showOnboardingModal.value = false;
        showAuthToast.value = false;
        return;
      }
      authError.value = result.error ?? 'No se pudo completar el inicio de sesión con Google.';
    });
  }

  /**
   * Intenta activar Smart Mode. Si no hay sesión ni API Key BYOK,
   * bloquea la activación y despliega AuthToast.
   */
  toggleSmartMode(enable: boolean): boolean {
    if (enable && !isAuthenticated.value) {
      smartModeEnabled.value = false;
      showAuthToast.value = true;
      return false;
    }
    smartModeEnabled.value = enable;
    showAuthToast.value = false;
    return true;
  }

  async loginWithGoogle(): Promise<void> {
    authError.value = null;
    try {
      const { authUrl } = await this.bridge.initiateOAuthLogin();
      await this.bridge.openExternalUrl(authUrl);
    } catch (err) {
      authError.value =
        err instanceof Error ? err.message : 'No se pudo iniciar el flujo OAuth 2.0.';
    }
  }

  async completeOAuthCallback(code: string): Promise<void> {
    const { accessToken, userEmail } = await this.bridge.handleOAuthCallback(code);
    credentials.value = {
      ...credentials.value,
      accessToken,
      userEmail,
    };
    authError.value = null;
    showOnboardingModal.value = false;
    showAuthToast.value = false;
  }

  async saveByokApiKey(apiKey: string): Promise<void> {
    await this.bridge.saveApiKey(apiKey);
    credentials.value = {
      ...credentials.value,
      apiKey: apiKey.trim(),
    };
    authError.value = null;
    showOnboardingModal.value = false;
    showAuthToast.value = false;
  }

  async logout(): Promise<void> {
    await this.bridge.clearCredentials();
    credentials.value = { accessToken: null, apiKey: null, userEmail: null };
    smartModeEnabled.value = false;
  }
}

import type { IPlatformBridge, StoredCredentials } from '../platform/bridge';
import {
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
    await this.bridge.initiateOAuthLogin();
  }

  async completeOAuthCallback(code: string): Promise<void> {
    const { accessToken, userEmail } = await this.bridge.handleOAuthCallback(code);
    credentials.value = {
      ...credentials.value,
      accessToken,
      userEmail,
    };
    showOnboardingModal.value = false;
    showAuthToast.value = false;
  }

  async saveByokApiKey(apiKey: string): Promise<void> {
    await this.bridge.saveApiKey(apiKey);
    credentials.value = {
      ...credentials.value,
      apiKey: apiKey.trim(),
    };
    showOnboardingModal.value = false;
    showAuthToast.value = false;
  }

  async logout(): Promise<void> {
    await this.bridge.clearCredentials();
    credentials.value = { accessToken: null, apiKey: null, userEmail: null };
    smartModeEnabled.value = false;
  }
}

import { beforeEach, describe, expect, it } from 'vitest';
import { MockPlatformAdapter } from '../../platform/mock-adapter';
import {
  credentials,
  showAuthToast,
  showOnboardingModal,
  smartModeEnabled,
} from '../../store/session-store';
import { GoogleAuthService } from '../google-auth';

describe('GoogleAuthService (TC-AUTH)', () => {
  let bridge: MockPlatformAdapter;
  let service: GoogleAuthService;

  beforeEach(() => {
    bridge = new MockPlatformAdapter();
    service = new GoogleAuthService(bridge);
    credentials.value = { accessToken: null, apiKey: null, userEmail: null };
    smartModeEnabled.value = false;
    showAuthToast.value = false;
    showOnboardingModal.value = false;
  });

  it('TC-AUTH-01: permite navegar sin sesión y muestra modal de onboarding opcional', async () => {
    const stored = await service.initialize();
    expect(stored.accessToken).toBeNull();
    expect(showOnboardingModal.value).toBe(true);
  });

  it('TC-AUTH-02: bloquea Smart Mode sin sesión y despliega AuthToast', async () => {
    await service.initialize();
    const allowed = service.toggleSmartMode(true);

    expect(allowed).toBe(false);
    expect(smartModeEnabled.value).toBe(false);
    expect(showAuthToast.value).toBe(true);
  });

  it('TC-AUTH-03: completa OAuth callback y habilita Smart Mode', async () => {
    await service.completeOAuthCallback('pkce-code-999');

    expect(credentials.value.accessToken).toBe('mock-oauth-token-pkce-code-999');
    expect(service.toggleSmartMode(true)).toBe(true);
    expect(smartModeEnabled.value).toBe(true);
  });

  it('TC-AUTH-04: soporta BYOK (API Key) y habilita Smart Mode sin OAuth', async () => {
    await service.saveByokApiKey('AIzaSyTestKey00001');

    expect(credentials.value.apiKey).toBe('AIzaSyTestKey00001');
    expect(service.toggleSmartMode(true)).toBe(true);
    expect(smartModeEnabled.value).toBe(true);
  });
});

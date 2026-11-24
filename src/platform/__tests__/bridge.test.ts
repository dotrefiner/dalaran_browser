import { describe, expect, it, vi } from 'vitest';
import { MockPlatformAdapter } from '../mock-adapter';

describe('IPlatformBridge / MockPlatformAdapter', () => {
  it('permite almacenar y limpiar credenciales OAuth y BYOK sin localStorage', async () => {
    const bridge = new MockPlatformAdapter();
    expect(await bridge.getStoredCredentials()).toEqual({
      accessToken: null,
      apiKey: null,
      userEmail: null,
    });

    await bridge.handleOAuthCallback('auth-code-123');
    await bridge.saveApiKey('AIzaSyMockKey12345');

    const creds = await bridge.getStoredCredentials();
    expect(creds.accessToken).toBe('mock-oauth-token-auth-code-123');
    expect(creds.apiKey).toBe('AIzaSyMockKey12345');

    await bridge.clearCredentials();
    expect(await bridge.getStoredCredentials()).toEqual({
      accessToken: null,
      apiKey: null,
      userEmail: null,
    });
  });

  it('propaga eventos de selección y permite desuscribirse limpiamente', () => {
    const bridge = new MockPlatformAdapter();
    const listener = vi.fn();
    const unsubscribe = bridge.onSelectionEvent(listener);

    bridge.emitMockSelection({
      selectedText: 'hexagonal',
      contextSurrounding: 'La arquitectura hexagonal permite desacoplar.',
      rect: { x: 100, y: 200, width: 80, height: 20 },
      anchorOffset: 15,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();

    bridge.emitMockSelection({
      selectedText: 'otro',
      contextSurrounding: 'otro contexto',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      anchorOffset: 0,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

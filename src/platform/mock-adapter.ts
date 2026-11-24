import type {
  ExportMarkdownOptions,
  IPlatformBridge,
  PlatformInfo,
  StoredCredentials,
  TextSelectionPayload,
} from './bridge';

/**
 * Adaptador simulado para pruebas unitarias (Vitest), desarrollo web aislado
 * y verificación de flujos sin runtime nativo.
 */
export class MockPlatformAdapter implements IPlatformBridge {
  private credentials: StoredCredentials = {
    accessToken: null,
    apiKey: null,
    userEmail: null,
  };
  private currentUrl = 'about:blank';
  private selectionListeners = new Set<(payload: TextSelectionPayload) => void>();
  private platformInfo: PlatformInfo;

  constructor(platformInfo: PlatformInfo = { isMobile: false, os: 'linux' }) {
    this.platformInfo = platformInfo;
  }

  async initiateOAuthLogin(): Promise<{ authUrl: string }> {
    return { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=true' };
  }

  async handleOAuthCallback(code: string): Promise<{ accessToken: string; userEmail: string }> {
    if (!code) {
      throw new Error('Código de autorización OAuth vacío');
    }
    const accessToken = `mock-oauth-token-${code}`;
    const userEmail = 'usuario@dalaran.test';
    this.credentials = { ...this.credentials, accessToken, userEmail };
    return { accessToken, userEmail };
  }

  async saveApiKey(apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      throw new Error('API Key inválida');
    }
    this.credentials = { ...this.credentials, apiKey: apiKey.trim() };
  }

  async getStoredCredentials(): Promise<StoredCredentials> {
    return { ...this.credentials };
  }

  async clearCredentials(): Promise<void> {
    this.credentials = { accessToken: null, apiKey: null, userEmail: null };
  }

  async createBrowsingView(_containerId: string, initialUrl: string): Promise<void> {
    this.currentUrl = initialUrl;
  }

  async navigateBrowsingView(url: string): Promise<void> {
    this.currentUrl = url;
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  async executeInContentScript<T>(_scriptCode: string): Promise<T> {
    return undefined as T;
  }

  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void {
    this.selectionListeners.add(callback);
    return () => {
      this.selectionListeners.delete(callback);
    };
  }

  emitMockSelection(payload: TextSelectionPayload): void {
    for (const listener of this.selectionListeners) {
      listener(payload);
    }
  }

  async saveMarkdownFileDialog(
    options: ExportMarkdownOptions
  ): Promise<{ success: boolean; filePath?: string }> {
    return { success: true, filePath: `/mock/exports/${options.filename}` };
  }

  getPlatformInfo(): PlatformInfo {
    return this.platformInfo;
  }
}

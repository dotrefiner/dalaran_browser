import type {
  BrowsingViewOptions,
  ContentScriptCommand,
  ExportMarkdownOptions,
  IPlatformBridge,
  OAuthLoginResult,
  PageLoadedPayload,
  PlatformInfo,
  StoredCredentials,
  TextSelectionPayload,
  ViewBounds,
} from './bridge';

const MOCK_PAGE_HTML = `<!doctype html>
<html lang="es">
  <head><title>Arquitectura hexagonal — Mock</title></head>
  <body>
    <nav>Menú de navegación</nav>
    <article>
      <h1>Arquitectura hexagonal</h1>
      <p>La arquitectura hexagonal aísla el dominio de la aplicación de los detalles de infraestructura mediante puertos y adaptadores.</p>
      <p>Los adaptadores traducen eventos del mundo exterior a llamadas del dominio y viceversa.</p>
    </article>
    <footer>Pie de página</footer>
  </body>
</html>`;

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
  private bounds: ViewBounds = { x: 0, y: 56, width: 1280, height: 784 };
  private selectionListeners = new Set<(payload: TextSelectionPayload) => void>();
  private pageLoadedListeners = new Set<(payload: PageLoadedPayload) => void>();
  private commandListeners = new Set<(command: ContentScriptCommand) => void>();
  private oauthResultListeners = new Set<(result: OAuthLoginResult) => void>();
  private lastExternalUrl: string | null = null;
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

  async openExternalUrl(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`URL externa no permitida: ${url}`);
    }
    this.lastExternalUrl = url;

    // Simula el listener loopback nativo: al abrir la URL de OAuth, la
    // autenticación se completa automáticamente en el entorno de pruebas.
    if (url.includes('accounts.google.com/o/oauth2')) {
      queueMicrotask(() => {
        const accessToken = 'mock-oauth-token-e2e';
        const userEmail = 'usuario@dalaran.test';
        this.credentials = { ...this.credentials, accessToken, userEmail };
        this.emitMockOAuthResult({
          success: true,
          accessToken,
          userEmail,
          error: null,
        });
      });
    }
  }

  onOAuthLoginResult(callback: (result: OAuthLoginResult) => void): () => void {
    this.oauthResultListeners.add(callback);
    return () => {
      this.oauthResultListeners.delete(callback);
    };
  }

  getLastExternalUrl(): string | null {
    return this.lastExternalUrl;
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

  async createBrowsingView(
    _containerId: string,
    initialUrl: string,
    options?: BrowsingViewOptions
  ): Promise<void> {
    this.currentUrl = initialUrl;
    if (options?.bounds) {
      this.bounds = { ...options.bounds };
    }
    this.emitPageLoaded(initialUrl);
  }

  async setBrowsingViewBounds(bounds: ViewBounds): Promise<void> {
    this.bounds = { ...bounds };
  }

  async navigateBrowsingView(url: string): Promise<void> {
    this.currentUrl = url;
    this.emitPageLoaded(url);
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  getCurrentBounds(): ViewBounds {
    return { ...this.bounds };
  }

  async executeInContentScript<T>(scriptCode: string): Promise<T> {
    if (scriptCode.includes('document.documentElement.outerHTML')) {
      return MOCK_PAGE_HTML as T;
    }
    return undefined as T;
  }

  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void {
    this.selectionListeners.add(callback);
    return () => {
      this.selectionListeners.delete(callback);
    };
  }

  onPageLoaded(callback: (payload: PageLoadedPayload) => void): () => void {
    this.pageLoadedListeners.add(callback);
    return () => {
      this.pageLoadedListeners.delete(callback);
    };
  }

  onContentScriptCommand(callback: (command: ContentScriptCommand) => void): () => void {
    this.commandListeners.add(callback);
    return () => {
      this.commandListeners.delete(callback);
    };
  }

  emitMockSelection(payload: TextSelectionPayload): void {
    for (const listener of this.selectionListeners) {
      listener(payload);
    }
  }

  emitMockCommand(command: ContentScriptCommand): void {
    for (const listener of this.commandListeners) {
      listener(command);
    }
  }

  emitMockOAuthResult(result: OAuthLoginResult): void {
    for (const listener of this.oauthResultListeners) {
      listener(result);
    }
  }

  private emitPageLoaded(url: string): void {
    queueMicrotask(() => {
      for (const listener of this.pageLoadedListeners) {
        listener({ url, phase: 'finished' });
      }
    });
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

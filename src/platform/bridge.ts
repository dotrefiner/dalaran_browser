export interface NavigationOptions {
  url: string;
  smartModeEnabled: boolean;
}

export interface TextSelectionPayload {
  selectedText: string;
  contextSurrounding: string;
  rect: { x: number; y: number; width: number; height: number };
  anchorOffset: number;
  action?: 'define' | 'translate' | 'note' | 'chat';
}

export interface ExportMarkdownOptions {
  filename: string;
  content: string;
  suggestedDirectory?: string;
}

export interface StoredCredentials {
  accessToken: string | null;
  apiKey: string | null;
  userEmail: string | null;
}

export interface PlatformInfo {
  isMobile: boolean;
  os: 'linux' | 'macos' | 'windows' | 'android' | 'ios';
}

/** Coordenadas lógicas del contenedor del WebView hijo, relativas a la ventana. */
export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowsingViewOptions {
  bounds?: ViewBounds;
  /**
   * Bundle IIFE del content script. Se inyecta con `initialization_script`,
   * por lo que se vuelve a ejecutar en cada navegación del WebView.
   */
  initScript?: string;
}

export interface PageLoadedPayload {
  url: string;
  phase: 'started' | 'finished';
}

/** Resultado del flujo OAuth resuelto por el listener loopback nativo. */
export interface OAuthLoginResult {
  success: boolean;
  accessToken: string | null;
  userEmail: string | null;
  error: string | null;
}

/** Comandos Keyboard-First emitidos desde el content script. */
export type ContentScriptCommand = 'smart-toggle' | 'focus-url';

/**
 * Contrato agnóstico de plataforma para desacoplar la UI y la lógica de negocio
 * del runtime nativo (Tauri v2, Electron o Mock para tests).
 */
export interface IPlatformBridge {
  // Autenticación (OAuth 2.0 + BYOK)
  initiateOAuthLogin(): Promise<{ authUrl: string }>;
  handleOAuthCallback(code: string): Promise<{ accessToken: string; userEmail: string }>;
  openExternalUrl(url: string): Promise<void>;
  onOAuthLoginResult(callback: (result: OAuthLoginResult) => void): () => void;
  saveApiKey(apiKey: string): Promise<void>;
  getStoredCredentials(): Promise<StoredCredentials>;
  clearCredentials(): Promise<void>;

  // Gestión de WebViews y navegación
  createBrowsingView(
    containerId: string,
    initialUrl: string,
    options?: BrowsingViewOptions
  ): Promise<void>;
  setBrowsingViewBounds(bounds: ViewBounds): Promise<void>;
  navigateBrowsingView(url: string): Promise<void>;
  executeInContentScript<T>(scriptCode: string): Promise<T>;
  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void;
  onPageLoaded(callback: (payload: PageLoadedPayload) => void): () => void;
  onContentScriptCommand(callback: (command: ContentScriptCommand) => void): () => void;

  // Sistema de archivos nativo
  saveMarkdownFileDialog(
    options: ExportMarkdownOptions
  ): Promise<{ success: boolean; filePath?: string }>;

  // Métricas y plataforma
  getPlatformInfo(): PlatformInfo;
}

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

/**
 * Contrato agnóstico de plataforma para desacoplar la UI y la lógica de negocio
 * del runtime nativo (Tauri v2, Electron o Mock para tests).
 */
export interface IPlatformBridge {
  // Autenticación (OAuth 2.0 + BYOK)
  initiateOAuthLogin(): Promise<{ authUrl: string }>;
  handleOAuthCallback(code: string): Promise<{ accessToken: string; userEmail: string }>;
  saveApiKey(apiKey: string): Promise<void>;
  getStoredCredentials(): Promise<StoredCredentials>;
  clearCredentials(): Promise<void>;

  // Gestión de WebViews y navegación
  createBrowsingView(containerId: string, initialUrl: string): Promise<void>;
  navigateBrowsingView(url: string): Promise<void>;
  executeInContentScript<T>(scriptCode: string): Promise<T>;
  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void;

  // Sistema de archivos nativo
  saveMarkdownFileDialog(
    options: ExportMarkdownOptions
  ): Promise<{ success: boolean; filePath?: string }>;

  // Métricas y plataforma
  getPlatformInfo(): PlatformInfo;
}

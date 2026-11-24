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

/**
 * Stub de portabilidad para Electron (contextBridge / ipcRenderer).
 * Permite migrar la Shell UI a Electron sin reescribir la lógica de negocio.
 */
export class ElectronPlatformAdapter implements IPlatformBridge {
  private notImplemented(method: string): never {
    throw new Error(`ElectronPlatformAdapter.${method} aún no implementado`);
  }

  initiateOAuthLogin(): Promise<{ authUrl: string }> {
    return this.notImplemented('initiateOAuthLogin');
  }

  handleOAuthCallback(_code: string): Promise<{ accessToken: string; userEmail: string }> {
    return this.notImplemented('handleOAuthCallback');
  }

  openExternalUrl(_url: string): Promise<void> {
    return this.notImplemented('openExternalUrl');
  }

  onOAuthLoginResult(_callback: (result: OAuthLoginResult) => void): () => void {
    return this.notImplemented('onOAuthLoginResult');
  }

  saveApiKey(_apiKey: string): Promise<void> {
    return this.notImplemented('saveApiKey');
  }

  getStoredCredentials(): Promise<StoredCredentials> {
    return this.notImplemented('getStoredCredentials');
  }

  clearCredentials(): Promise<void> {
    return this.notImplemented('clearCredentials');
  }

  createBrowsingView(
    _containerId: string,
    _initialUrl: string,
    _options?: BrowsingViewOptions
  ): Promise<void> {
    return this.notImplemented('createBrowsingView');
  }

  setBrowsingViewBounds(_bounds: ViewBounds): Promise<void> {
    return this.notImplemented('setBrowsingViewBounds');
  }

  navigateBrowsingView(_url: string): Promise<void> {
    return this.notImplemented('navigateBrowsingView');
  }

  executeInContentScript<T>(_scriptCode: string): Promise<T> {
    return this.notImplemented('executeInContentScript');
  }

  onSelectionEvent(_callback: (payload: TextSelectionPayload) => void): () => void {
    return this.notImplemented('onSelectionEvent');
  }

  onPageLoaded(_callback: (payload: PageLoadedPayload) => void): () => void {
    return this.notImplemented('onPageLoaded');
  }

  onContentScriptCommand(_callback: (command: ContentScriptCommand) => void): () => void {
    return this.notImplemented('onContentScriptCommand');
  }

  saveMarkdownFileDialog(
    _options: ExportMarkdownOptions
  ): Promise<{ success: boolean; filePath?: string }> {
    return this.notImplemented('saveMarkdownFileDialog');
  }

  getPlatformInfo(): PlatformInfo {
    return { isMobile: false, os: 'linux' };
  }
}

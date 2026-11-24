import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
 * Implementación nativa de IPlatformBridge usando Tauri v2.
 * Invariante: @tauri-apps/api solo puede importarse dentro de este archivo.
 */
export class TauriPlatformAdapter implements IPlatformBridge {
  async initiateOAuthLogin(): Promise<{ authUrl: string }> {
    return invoke<{ authUrl: string }>('initiate_oauth_login');
  }

  async handleOAuthCallback(code: string): Promise<{ accessToken: string; userEmail: string }> {
    return invoke<{ accessToken: string; userEmail: string }>('handle_oauth_callback', { code });
  }

  async openExternalUrl(url: string): Promise<void> {
    return invoke<void>('open_external_url', { url });
  }

  onOAuthLoginResult(callback: (result: OAuthLoginResult) => void): () => void {
    return this.subscribe('oauth-login-result', callback);
  }

  async saveApiKey(apiKey: string): Promise<void> {
    return invoke<void>('save_api_key', { apiKey });
  }

  async getStoredCredentials(): Promise<StoredCredentials> {
    return invoke<StoredCredentials>('get_stored_credentials');
  }

  async clearCredentials(): Promise<void> {
    return invoke<void>('clear_credentials');
  }

  async createBrowsingView(
    containerId: string,
    initialUrl: string,
    options?: BrowsingViewOptions
  ): Promise<void> {
    return invoke<void>('create_browsing_view', { containerId, initialUrl, options });
  }

  async setBrowsingViewBounds(bounds: ViewBounds): Promise<void> {
    return invoke<void>('set_browsing_view_bounds', { bounds });
  }

  async navigateBrowsingView(url: string): Promise<void> {
    return invoke<void>('navigate_browsing_view', { url });
  }

  async executeInContentScript<T>(scriptCode: string): Promise<T> {
    return invoke<T>('execute_in_content_script', { scriptCode });
  }

  private subscribe<T>(eventName: string, callback: (payload: T) => void): () => void {
    let unlistenFn: (() => void) | null = null;
    let disposed = false;

    void listen<T>(eventName, (event) => {
      callback(event.payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenFn = unlisten;
      }
    });

    return () => {
      disposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }

  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void {
    return this.subscribe('webview-text-selection', callback);
  }

  onPageLoaded(callback: (payload: PageLoadedPayload) => void): () => void {
    return this.subscribe('webview-page-loaded', callback);
  }

  onContentScriptCommand(callback: (command: ContentScriptCommand) => void): () => void {
    return this.subscribe<{ command: ContentScriptCommand }>('content-script-command', (payload) => {
      callback(payload.command);
    });
  }

  async saveMarkdownFileDialog(
    options: ExportMarkdownOptions
  ): Promise<{ success: boolean; filePath?: string }> {
    return invoke<{ success: boolean; filePath?: string }>('export_markdown_file', { options });
  }

  getPlatformInfo(): PlatformInfo {
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /android|iphone|ipad|mobile/.test(ua);

    let os: PlatformInfo['os'] = 'linux';
    if (ua.includes('win')) os = 'windows';
    else if (ua.includes('mac')) os = 'macos';
    else if (ua.includes('android')) os = 'android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'ios';

    return { isMobile, os };
  }
}

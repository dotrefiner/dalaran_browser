import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ExportMarkdownOptions,
  IPlatformBridge,
  PlatformInfo,
  StoredCredentials,
  TextSelectionPayload,
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

  async saveApiKey(apiKey: string): Promise<void> {
    return invoke<void>('save_api_key', { apiKey });
  }

  async getStoredCredentials(): Promise<StoredCredentials> {
    return invoke<StoredCredentials>('get_stored_credentials');
  }

  async clearCredentials(): Promise<void> {
    return invoke<void>('clear_credentials');
  }

  async createBrowsingView(containerId: string, initialUrl: string): Promise<void> {
    return invoke<void>('create_browsing_view', { containerId, initialUrl });
  }

  async navigateBrowsingView(url: string): Promise<void> {
    return invoke<void>('navigate_browsing_view', { url });
  }

  async executeInContentScript<T>(scriptCode: string): Promise<T> {
    return invoke<T>('execute_in_content_script', { scriptCode });
  }

  onSelectionEvent(callback: (payload: TextSelectionPayload) => void): () => void {
    let unlistenFn: (() => void) | null = null;
    let disposed = false;

    void listen<TextSelectionPayload>('webview-text-selection', (event) => {
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

import { useEffect, useMemo } from 'preact/hooks';
import { AdaptivePanel } from './components/AdaptivePanel';
import { AuthToast } from './components/AuthToast';
import { BrowserBar } from './components/BrowserBar';
import { DefinitionView } from './components/DefinitionView';
import { NoteEditorView } from './components/NoteEditorView';
import { OnboardingModal } from './components/OnboardingModal';
import { ContextCache } from './core/context-cache';
import { MarkdownEngine, type ExportMode } from './core/markdown-engine';
import { SessionPersistence } from './core/session-persistence';
import type { IPlatformBridge, TextSelectionPayload } from './platform/bridge';
import { TauriPlatformAdapter } from './platform/tauri-adapter';
import { GeminiClient } from './services/gemini-client';
import { GoogleAuthService } from './services/google-auth';
import {
  activeContextSummary,
  activeSelection,
  cleanedBodyText,
  credentials,
  currentPageTitle,
  currentUrl,
  isIncognito,
  isPanelLoading,
  panelError,
  panelMode,
  panelOutputText,
  resetPagePrivacyState,
  sessionNotes,
  showOnboardingModal,
} from './store/session-store';

export interface AppProps {
  bridge?: IPlatformBridge;
}

export function App({ bridge: injectedBridge }: AppProps) {
  const bridge = useMemo(() => injectedBridge ?? new TauriPlatformAdapter(), [injectedBridge]);
  const authService = useMemo(() => new GoogleAuthService(bridge), [bridge]);
  const contextCache = useMemo(() => new ContextCache(20), []);
  const persistence = useMemo(() => new SessionPersistence(window.localStorage), []);
  const markdownEngine = useMemo(
    () =>
      new MarkdownEngine({
        sourceUrl: currentUrl.value,
        pageTitle: currentPageTitle.value,
        cleanedBodyText: cleanedBodyText.value,
        notes: sessionNotes.value,
        isIncognito: isIncognito.value,
      }),
    [currentUrl.value]
  );
  const platformInfo = useMemo(() => bridge.getPlatformInfo(), [bridge]);

  const syncMarkdownState = () => {
    markdownEngine.setIncognito(isIncognito.value);
    const state = markdownEngine.getState();
    sessionNotes.value = state.notes;
    persistence.saveSession(state);
  };

  const handleExportMarkdown = async (mode: ExportMode) => {
    const content = markdownEngine.exportMarkdown(mode);
    await bridge.saveMarkdownFileDialog({
      filename: 'notas-lectura.md',
      content,
    });
  };

  useEffect(() => {
    void authService.initialize();
    void bridge.createBrowsingView('browsing-view', currentUrl.value);

    const unlisten = bridge.onSelectionEvent((payload) => {
      void handleSelectionAction(payload);
    });

    return () => {
      unlisten();
    };
  }, [authService, bridge]);

  const handleNavigate = async (url: string) => {
    resetPagePrivacyState();
    await bridge.navigateBrowsingView(url);
  };

  const handleSelectionAction = async (payload: TextSelectionPayload) => {
    activeSelection.value = payload;

    const action = payload.action ?? 'define';
    if (action === 'define' || action === 'translate') {
      panelMode.value = action === 'define' ? 'definition' : 'translation';
      panelError.value = null;

      const apiKey = credentials.value.apiKey ?? credentials.value.accessToken;
      if (!apiKey) {
        panelError.value = 'Inicia sesión o configura una API Key para usar Smart Mode.';
        return;
      }

      isPanelLoading.value = true;
      try {
        const client = new GeminiClient({ apiKey });
        const cached = contextCache.get(currentUrl.value);
        activeContextSummary.value = cached ?? null;

        panelOutputText.value =
          action === 'define'
            ? await client.defineInContext(payload.selectedText, payload.contextSurrounding, cached)
            : await client.translateSelection(payload.selectedText, 'español', cached);
      } catch (err) {
        panelError.value = err instanceof Error ? err.message : 'Error consultando Gemini';
      } finally {
        isPanelLoading.value = false;
      }
    } else if (action === 'note') {
      panelMode.value = 'notes';
    } else if (action === 'chat') {
      panelMode.value = 'chat';
    }
  };

  return (
    <div class="app-shell">
      <BrowserBar
        onNavigate={(url) => void handleNavigate(url)}
        onToggleSmartMode={(enable) => authService.toggleSmartMode(enable)}
        onOpenAuthModal={() => {
          showOnboardingModal.value = true;
        }}
      />

      <AuthToast onGoogleLogin={() => void authService.loginWithGoogle()} />
      <OnboardingModal
        onGoogleLogin={() => void authService.loginWithGoogle()}
        onSaveApiKey={(key) => authService.saveByokApiKey(key)}
      />

      <main class={`workspace ${platformInfo.isMobile ? 'mobile' : 'desktop'}`}>
        <section id="browsing-view" class="webview-container" aria-label="Área de navegación">
          <div class="webview-placeholder">
            <p>WebView aislado activo: {currentUrl.value}</p>
          </div>
        </section>

        <AdaptivePanel isMobile={platformInfo.isMobile}>
          {(panelMode.value === 'definition' || panelMode.value === 'translation') && (
            <DefinitionView />
          )}
          {panelMode.value === 'notes' && (
            <NoteEditorView
              notes={sessionNotes.value}
              onAddNote={(text, note, ctx, offset) => {
                markdownEngine.addNote(text, note, ctx, offset);
                syncMarkdownState();
              }}
              onUpdateNote={(id, note) => {
                markdownEngine.updateNote(id, note);
                syncMarkdownState();
              }}
              onDeleteNote={(id) => {
                markdownEngine.deleteNote(id);
                syncMarkdownState();
              }}
              onExportMarkdown={handleExportMarkdown}
            />
          )}
        </AdaptivePanel>
      </main>
    </div>
  );
}

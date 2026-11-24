import { useEffect, useMemo, useRef } from 'preact/hooks';
import { contentScriptSource } from 'virtual:dalaran-content-script';
import { AdaptivePanel } from './components/AdaptivePanel';
import { AuthToast } from './components/AuthToast';
import { BrowserBar } from './components/BrowserBar';
import { ContextualChat } from './components/ContextualChat';
import { DefinitionView } from './components/DefinitionView';
import { NoteEditorView } from './components/NoteEditorView';
import { OnboardingModal } from './components/OnboardingModal';
import { buildContextualPromptPayload, type ChatScope } from './core/chat-context';
import { ContextCache } from './core/context-cache';
import { extractSafeContent } from './core/dom-extractor';
import { MarkdownEngine, type ExportMode } from './core/markdown-engine';
import { SessionPersistence } from './core/session-persistence';
import type { IPlatformBridge, TextSelectionPayload } from './platform/bridge';
import { MockPlatformAdapter } from './platform/mock-adapter';
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
  focusUrlBarRequest,
  isIncognito,
  isPanelLoading,
  isSensitivePaused,
  lastRedactedPiiCount,
  panelError,
  panelMode,
  panelOutputText,
  resetPagePrivacyState,
  sensitiveReason,
  sessionNotes,
  showOnboardingModal,
  smartModeEnabled,
} from './store/session-store';

export interface AppProps {
  bridge?: IPlatformBridge;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function App({ bridge: injectedBridge }: AppProps) {
  const bridge = useMemo(
    () =>
      injectedBridge ??
      (isTauriRuntime() ? new TauriPlatformAdapter() : new MockPlatformAdapter()),
    [injectedBridge]
  );
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
  const viewContainerRef = useRef<HTMLElement | null>(null);
  const loadSequence = useRef(0);

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

  const handleChatMessage = async (
    question: string,
    scope: ChatScope,
    onChunk: (partial: string) => void
  ) => {
    const apiKey = credentials.value.apiKey ?? credentials.value.accessToken;
    if (!apiKey) {
      throw new Error('Inicia sesión o configura una API Key para iniciar el debate contextual.');
    }

    const client = new GeminiClient({ apiKey });
    const cached = contextCache.get(currentUrl.value) ?? activeContextSummary.value;
    const contextPayload = buildContextualPromptPayload({
      scope,
      selectedText: activeSelection.value?.selectedText,
      cleanedBodyText: cleanedBodyText.value,
      siteSummary: cached,
      notes: sessionNotes.value,
    });

    for await (const chunk of client.streamContextualChat(question, contextPayload)) {
      onChunk(chunk);
    }
  };

  const handlePageLoaded = async (url: string, requestId: number) => {
    if (requestId !== loadSequence.current) return;

    currentUrl.value = url;
    resetPagePrivacyState();

    if (!smartModeEnabled.value) return;

    try {
      const html = await bridge.executeInContentScript<string>(
        'document.documentElement.outerHTML'
      );
      if (requestId !== loadSequence.current) return;
      if (typeof html !== 'string' || !html.trim()) return;

      const documentClone = new DOMParser().parseFromString(html, 'text/html');
      const extracted = extractSafeContent(documentClone, url);
      if (requestId !== loadSequence.current) return;

      currentPageTitle.value = extracted.title;
      cleanedBodyText.value = extracted.cleanedText;
      lastRedactedPiiCount.value = extracted.redactedCount;

      if (extracted.isSensitive) {
        isSensitivePaused.value = true;
        sensitiveReason.value =
          extracted.sensitiveReason ?? 'La página contiene credenciales o datos de pago';
        smartModeEnabled.value = false;
        return;
      }

      const apiKey = credentials.value.apiKey ?? credentials.value.accessToken;
      if (!apiKey || !extracted.cleanedText) return;

      const client = new GeminiClient({ apiKey });
      const summary = await client.preScanDocument(extracted.cleanedText);
      if (requestId !== loadSequence.current) return;

      const cached = contextCache.set(url, summary);
      activeContextSummary.value = cached;
    } catch (err) {
      // El pre-escaneo es best-effort: no debe interrumpir la lectura si falla.
      console.warn('No se pudo pre-escanear la página:', err);
    }
  };

  useEffect(() => {
    void authService.initialize();
    const unlistenOAuthResult = authService.watchOAuthResult();

    const container = viewContainerRef.current;
    const rect = container?.getBoundingClientRect();
    const initialBounds = rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : undefined;

    void bridge.createBrowsingView('browsing-view', currentUrl.value, {
      bounds: initialBounds,
      initScript: contentScriptSource,
    });

    const unlistenSelection = bridge.onSelectionEvent((payload) => {
      void handleSelectionAction(payload);
    });

    const unlistenPageLoad = bridge.onPageLoaded((payload) => {
      if (payload.phase !== 'finished') return;
      const requestId = ++loadSequence.current;
      void handlePageLoaded(payload.url, requestId);
    });

    const unlistenCommand = bridge.onContentScriptCommand((command) => {
      if (command === 'smart-toggle') {
        authService.toggleSmartMode(!smartModeEnabled.value);
      } else if (command === 'focus-url') {
        focusUrlBarRequest.value += 1;
      }
    });

    return () => {
      unlistenSelection();
      unlistenPageLoad();
      unlistenCommand();
      unlistenOAuthResult();
    };
  }, [authService, bridge]);

  // Mantiene el WebView hijo alineado con el contenedor al redimensionar,
  // abrir/cerrar el panel lateral o cambiar entre layouts desktop/mobile.
  useEffect(() => {
    const container = viewContainerRef.current;
    if (!container) return;

    let frame = 0;
    const sendBounds = () => {
      const rect = container.getBoundingClientRect();
      void bridge
        .setBrowsingViewBounds({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        .catch(() => {
          // El WebView aún no existe o la ventana se está cerrando.
        });
    };

    const scheduleBoundsUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sendBounds);
    };

    const observer = new ResizeObserver(scheduleBoundsUpdate);
    observer.observe(container);
    window.addEventListener('resize', scheduleBoundsUpdate);
    scheduleBoundsUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleBoundsUpdate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [bridge]);

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
        <section
          ref={viewContainerRef}
          id="browsing-view"
          class="webview-container"
          aria-label="Área de navegación"
        >
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
          {panelMode.value === 'chat' && (
            <ContextualChat onSendMessage={handleChatMessage} />
          )}
        </AdaptivePanel>
      </main>
    </div>
  );
}

import { computed, signal } from '@preact/signals';
import type { SiteContextSummary } from '../core/context-cache';
import type { NoteItem } from '../core/markdown-engine';
import type { StoredCredentials, TextSelectionPayload } from '../platform/bridge';

export type PanelViewMode = 'closed' | 'definition' | 'translation' | 'notes' | 'chat';

export const currentUrl = signal<string>('https://es.wikipedia.org/wiki/Arquitectura_hexagonal');
export const currentPageTitle = signal<string>('Arquitectura hexagonal');
export const cleanedBodyText = signal<string>('');
export const sessionNotes = signal<NoteItem[]>([]);
export const smartModeEnabled = signal<boolean>(false);
export const isIncognito = signal<boolean>(false);

// Estado de privacidad / sensibilidad de la página actual
export const isSensitivePaused = signal<boolean>(false);
export const sensitiveReason = signal<string | null>(null);
export const lastRedactedPiiCount = signal<number>(0);

// Estado de autenticación (OAuth 2.0 o BYOK)
export const credentials = signal<StoredCredentials>({
  accessToken: null,
  apiKey: null,
  userEmail: null,
});

export const isAuthenticated = computed(
  () => Boolean(credentials.value.accessToken || credentials.value.apiKey)
);

// UI overlays y panel adaptativo
export const showOnboardingModal = signal<boolean>(false);
export const showAuthToast = signal<boolean>(false);
export const panelMode = signal<PanelViewMode>('closed');
export const activeSelection = signal<TextSelectionPayload | null>(null);
export const activeContextSummary = signal<SiteContextSummary | null>(null);

export const panelOutputText = signal<string>('');
export const isPanelLoading = signal<boolean>(false);
export const panelError = signal<string | null>(null);

// Error del flujo de autenticación (OAuth o BYOK), visible en el modal.
export const authError = signal<string | null>(null);

// Contador incremental para solicitar foco en la barra de URL desde el WebView hijo.
export const focusUrlBarRequest = signal<number>(0);

export function resetPagePrivacyState(): void {
  isSensitivePaused.value = false;
  sensitiveReason.value = null;
  lastRedactedPiiCount.value = 0;
}

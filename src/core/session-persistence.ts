import type { SessionMarkdownState } from './markdown-engine';

export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = 'dalaran_session:';

/**
 * Capa de persistencia local anti-pérdida para sesiones de lectura y notas.
 * Respeta estrictamente el Modo Incógnito / Efímero (cero escritura en disco).
 */
export class SessionPersistence {
  constructor(private readonly storage: PersistenceStorage) {}

  private keyFor(url: string): string {
    return `${STORAGE_PREFIX}${url.split('#')[0] ?? url}`;
  }

  saveSession(state: SessionMarkdownState): boolean {
    if (state.isIncognito) {
      return false;
    }
    const serialized = JSON.stringify(state);
    this.storage.setItem(this.keyFor(state.sourceUrl), serialized);
    return true;
  }

  loadSession(sourceUrl: string): SessionMarkdownState | null {
    const raw = this.storage.getItem(this.keyFor(sourceUrl));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionMarkdownState;
    } catch {
      return null;
    }
  }

  clearSession(sourceUrl: string): void {
    this.storage.removeItem(this.keyFor(sourceUrl));
  }
}

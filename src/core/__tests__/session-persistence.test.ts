import { describe, expect, it } from 'vitest';
import { SessionPersistence, type PersistenceStorage } from '../session-persistence';
import type { SessionMarkdownState } from '../markdown-engine';

function createMemoryStorage(): PersistenceStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

describe('session-persistence (TC-PERSIST)', () => {
  it('TC-PERSIST-01: auto-guarda y recupera sesiones de lectura tras reinicio', () => {
    const mem = createMemoryStorage();
    const persistence = new SessionPersistence(mem);

    const session: SessionMarkdownState = {
      sourceUrl: 'https://docs.ejemplo.com/articulo#parte-2',
      pageTitle: 'Artículo Técnico',
      cleanedBodyText: 'Texto limpio.',
      notes: [
        {
          id: '1',
          selectedText: 'limpio',
          userNote: 'Nota importante',
          anchorId: 'nota-limpio-1',
          startOffset: 6,
          endOffset: 12,
          timestamp: 1000,
        },
      ],
      isIncognito: false,
    };

    expect(persistence.saveSession(session)).toBe(true);

    const restored = persistence.loadSession('https://docs.ejemplo.com/articulo');
    expect(restored).not.toBeNull();
    expect(restored?.notes).toHaveLength(1);
    expect(restored?.notes[0]?.userNote).toBe('Nota importante');
  });

  it('TC-PERSIST-02: no escribe cero bytes en disco cuando Modo Incógnito está activo', () => {
    const mem = createMemoryStorage();
    const persistence = new SessionPersistence(mem);

    const saved = persistence.saveSession({
      sourceUrl: 'https://privado.ejemplo.com',
      pageTitle: 'Privado',
      cleanedBodyText: 'Contenido efímero.',
      notes: [],
      isIncognito: true,
    });

    expect(saved).toBe(false);
    expect(mem.store.size).toBe(0);
    expect(persistence.loadSession('https://privado.ejemplo.com')).toBeNull();
  });
});

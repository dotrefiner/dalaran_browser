export interface SiteContextSummary {
  url: string;
  topic: string;
  keyEntities: string[];
  domainCategory: 'tecnologia' | 'finanzas' | 'medicina' | 'literatura' | 'general';
  cachedAt: number;
}

/**
 * Normaliza la URL eliminando el fragmento hash (#...) para indexar el caché.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return rawUrl.split('#')[0] ?? rawUrl;
  }
}

/**
 * Caché LRU en memoria para almacenar la temática y entidades clave por URL
 * y evitar llamadas redundantes a la API de Gemini.
 */
export class ContextCache {
  private readonly maxEntries: number;
  private readonly store = new Map<string, SiteContextSummary>();

  constructor(maxEntries = 20) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get(rawUrl: string): SiteContextSummary | undefined {
    const key = canonicalizeUrl(rawUrl);
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Refrescar posición LRU (mover al final)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(rawUrl: string, summary: Omit<SiteContextSummary, 'url' | 'cachedAt'>): SiteContextSummary {
    const key = canonicalizeUrl(rawUrl);
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const entry: SiteContextSummary = {
      ...summary,
      url: key,
      cachedAt: Date.now(),
    };
    this.store.set(key, entry);
    return entry;
  }

  invalidate(rawUrl: string): boolean {
    return this.store.delete(canonicalizeUrl(rawUrl));
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

import { describe, expect, it } from 'vitest';
import { ContextCache } from '../context-cache';

describe('context-cache (TC-CACHE)', () => {
  it('TC-CACHE-01: cachea por URL canónica ignorando fragmentos hash', () => {
    const cache = new ContextCache(10);
    cache.set('https://docs.ejemplo.com/guia#seccion-1', {
      topic: 'Documentación de prueba',
      keyEntities: ['TypeScript', 'Tauri'],
      domainCategory: 'tecnologia',
    });

    const hit = cache.get('https://docs.ejemplo.com/guia#seccion-2');
    expect(hit).toBeDefined();
    expect(hit?.topic).toBe('Documentación de prueba');
  });

  it('TC-CACHE-02: evapora las entradas más antiguas al superar el límite LRU', () => {
    const cache = new ContextCache(2);
    cache.set('https://a.com', { topic: 'A', keyEntities: [], domainCategory: 'general' });
    cache.set('https://b.com', { topic: 'B', keyEntities: [], domainCategory: 'general' });
    // Acceder a A para refrescarla; B pasa a ser la más antigua
    cache.get('https://a.com');
    cache.set('https://c.com', { topic: 'C', keyEntities: [], domainCategory: 'general' });

    expect(cache.size).toBe(2);
    expect(cache.get('https://b.com')).toBeUndefined();
    expect(cache.get('https://a.com')).toBeDefined();
    expect(cache.get('https://c.com')).toBeDefined();
  });

  it('TC-CACHE-03: invalida entradas al cerrar pestaña o limpiar caché', () => {
    const cache = new ContextCache(5);
    cache.set('https://tab1.com', { topic: 'T1', keyEntities: [], domainCategory: 'general' });
    expect(cache.invalidate('https://tab1.com')).toBe(true);
    expect(cache.get('https://tab1.com')).toBeUndefined();
  });
});

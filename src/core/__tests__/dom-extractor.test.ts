import { describe, expect, it } from 'vitest';
import { extractSafeContent } from '../dom-extractor';

function createDocument(html: string, title = 'Artículo de prueba'): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<html><head><title>${title}</title></head><body>${html}</body></html>`, 'text/html');
  return doc;
}

describe('dom-extractor (TC-DOM)', () => {
  it('TC-DOM-01: extrae el contenido principal y descarta ruido de navegación/publicidad', () => {
    const doc = createDocument(`
      <header><nav><a href="/">Inicio</a><a href="/about">Acerca</a></nav></header>
      <aside class="ads">Publicidad molesta y banners promocionales</aside>
      <main>
        <article>
          <h1>Arquitectura Hexagonal en TypeScript</h1>
          <p>La arquitectura hexagonal permite desacoplar el dominio de la infraestructura de forma limpia y mantenible.</p>
          <p>Al separar puertos y adaptadores, las pruebas unitarias se ejecutan sin dependencias externas.</p>
        </article>
      </main>
      <footer>Copyright 2026</footer>
    `);

    const result = extractSafeContent(doc, 'https://ejemplo.com/articulo');

    expect(result.isSensitive).toBe(false);
    expect(result.cleanedText).toContain('arquitectura hexagonal');
    expect(result.cleanedText).not.toContain('Publicidad molesta');
  });

  it('TC-DOM-02: elimina formularios, inputs, scripts y campos ocultos', () => {
    const doc = createDocument(`
      <article>
        <h1>Guía de Lectura</h1>
        <p>Contenido seguro para analizar.</p>
        <form action="/submit">
          <input type="text" value="dato privado" />
          <textarea>nota oculta</textarea>
          <button>Enviar</button>
        </form>
        <script>window.secret = "leak";</script>
      </article>
    `);

    const result = extractSafeContent(doc, 'https://ejemplo.com/guia');

    expect(result.isSensitive).toBe(false);
    expect(result.cleanedText).toContain('Contenido seguro para analizar.');
    expect(result.cleanedText).not.toContain('window.secret');
    expect(result.cleanedText).not.toContain('nota oculta');
    expect(result.cleanedText).not.toContain('Enviar');
  });

  it('pausa Smart Mode automáticamente si detecta un campo password o tarjeta', () => {
    const loginDoc = createDocument(`
      <form>
        <input type="email" />
        <input type="password" />
      </form>
    `);

    const loginResult = extractSafeContent(loginDoc, 'https://banco.ejemplo.com/login');
    expect(loginResult.isSensitive).toBe(true);
    expect(loginResult.cleanedText).toBe('');

    const paymentDoc = createDocument(`
      <form action="/checkout">
        <input autocomplete="cc-number" />
      </form>
    `);
    const payResult = extractSafeContent(paymentDoc, 'https://tienda.com/checkout');
    expect(payResult.isSensitive).toBe(true);
    expect(payResult.cleanedText).toBe('');
  });
});

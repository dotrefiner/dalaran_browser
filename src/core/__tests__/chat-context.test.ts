import { describe, expect, it } from 'vitest';
import { buildContextualPromptPayload } from '../chat-context';

describe('chat-context (ensamblado dinámico y PII)', () => {
  it('inyecta temática, notas previas y alcance de selección enmascarando PII', () => {
    const payload = buildContextualPromptPayload({
      scope: 'selection',
      selectedText: 'entropía de Shannon',
      cleanedBodyText: 'Texto completo del artículo sobre teoría de la información.',
      siteSummary: {
        url: 'https://ejemplo.com/info',
        topic: 'Teoría de la información',
        keyEntities: ['Shannon', 'Entropía'],
        domainCategory: 'tecnologia',
        cachedAt: 1000,
      },
      notes: [
        {
          id: '1',
          selectedText: 'información',
          userNote: 'Revisar contacto privado@correo.com',
          anchorId: 'nota-informacion-1',
          startOffset: 0,
          endOffset: 11,
          timestamp: 1000,
        },
      ],
    });

    expect(payload).toContain('Temática global: Teoría de la información');
    expect(payload).toContain('entropía de Shannon');
    expect(payload).toContain('Notas previas del usuario');
    expect(payload).toContain('[REDACTED_EMAIL]');
    expect(payload).not.toContain('privado@correo.com');
    expect(payload).not.toContain('Texto completo del artículo');
  });

  it('cambia al documento completo cuando el alcance es document', () => {
    const payload = buildContextualPromptPayload({
      scope: 'document',
      selectedText: 'solo fragmento',
      cleanedBodyText: 'Contenido completo del documento para debate global.',
      notes: [],
    });

    expect(payload).toContain('Contenido completo del documento para debate global.');
    expect(payload).not.toContain('Fragmento seleccionado:');
  });
});

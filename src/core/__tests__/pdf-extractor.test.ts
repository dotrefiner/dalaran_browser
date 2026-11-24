import { describe, expect, it } from 'vitest';
import { extractSafePdfContent } from '../pdf-extractor';

describe('pdf-extractor', () => {
  it('ordena páginas PDF y aplica el pipeline de PII scrubbing', () => {
    const result = extractSafePdfContent(
      'Paper Técnico',
      [
        { pageNumber: 2, text: 'Contacto del autor: investigador@universidad.edu' },
        { pageNumber: 1, text: 'Introducción sobre sistemas distribuidos.' },
      ],
      'file:///tmp/paper.pdf'
    );

    expect(result.isSensitive).toBe(false);
    expect(result.cleanedText).toContain('Introducción sobre sistemas distribuidos.');
    expect(result.cleanedText).toContain('[REDACTED_EMAIL]');
    expect(result.cleanedText).not.toContain('investigador@universidad.edu');
  });
});

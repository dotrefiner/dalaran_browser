import { describe, expect, it } from 'vitest';
import { applyLiveHighlights } from '../live-highlighter';

describe('live-highlighter (CSS.highlights)', () => {
  it('registra rangos en CSS.highlights sin mutar el DOM original', () => {
    document.body.innerHTML = '<p id="target">La arquitectura hexagonal separa dominio e infraestructura.</p>';
    const originalHtml = document.body.innerHTML;

    const mockRegistry = new Map<string, unknown>();
    class MockHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }

    (globalThis as unknown as { CSS: { highlights: Map<string, unknown> } }).CSS = {
      highlights: mockRegistry,
    };
    (globalThis as unknown as { Highlight: typeof MockHighlight }).Highlight = MockHighlight;

    const count = applyLiveHighlights(document.body, [
      { id: '1', selectedText: 'arquitectura hexagonal' },
    ]);

    expect(count).toBe(1);
    expect(mockRegistry.has('dalaran-note-highlight')).toBe(true);
    // Invariante: el DOM original no debe sufrir mutaciones
    expect(document.body.innerHTML).toBe(originalHtml);
  });
});

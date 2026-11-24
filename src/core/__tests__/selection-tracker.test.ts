import { describe, expect, it } from 'vitest';
import { clampPopoverCoordinates, resolveTextPosition } from '../selection-tracker';

describe('selection-tracker (TC-SEL-01 & TC-SEL-02)', () => {
  it('TC-SEL-01: calcula offsets exactos usando contexto circundante cuando hay repeticiones', () => {
    const body =
      'En el primer párrafo hablamos de entropía física. Luego en el tercer párrafo analizamos la entropía de Shannon.';
    const pos = resolveTextPosition(body, 'entropía', 'analizamos la entropía de Shannon');

    expect(pos).not.toBeNull();
    expect(pos?.startOffset).toBe(body.indexOf('entropía de Shannon'));
    expect(pos?.endOffset).toBe((pos?.startOffset ?? 0) + 'entropía'.length);
    expect(pos?.exactText).toBe('entropía');
  });

  it('TC-SEL-02: recalcula coordenadas del popover para no desbordar el viewport', () => {
    // Selección pegada al borde superior izquierdo (x=2, y=10)
    const topEdge = clampPopoverCoordinates(
      { x: 2, y: 10, width: 40, height: 18 },
      { width: 800, height: 600 }
    );
    expect(topEdge.top).toBeGreaterThanOrEqual(8);
    expect(topEdge.left).toBeGreaterThanOrEqual(8);

    // Selección pegada al borde derecho
    const rightEdge = clampPopoverCoordinates(
      { x: 780, y: 200, width: 30, height: 18 },
      { width: 800, height: 600 }
    );
    expect(rightEdge.left).toBeLessThanOrEqual(800 - 260 - 8);
  });
});

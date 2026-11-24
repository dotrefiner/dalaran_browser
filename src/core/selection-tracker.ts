export interface TextPositionRange {
  startOffset: number;
  endOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
}

/**
 * Mapea un fragmento seleccionado y su contexto circundante a los offsets exactos
 * dentro del texto limpio (`cleanedBodyText`), generando un selector tipo W3C TextQuoteSelector.
 */
export function resolveTextPosition(
  cleanedBodyText: string,
  selectedText: string,
  contextSurrounding?: string,
  hintOffset = 0
): TextPositionRange | null {
  const target = selectedText.trim();
  if (!cleanedBodyText || !target) return null;

  let startIndex = -1;

  // 1. Intentar desambiguar usando el contexto circundante si hay múltiples ocurrencias
  if (contextSurrounding) {
    const cleanContext = contextSurrounding.replace(/\s+/g, ' ').trim();
    const ctxIdx = cleanedBodyText.indexOf(cleanContext);
    if (ctxIdx !== -1) {
      const innerIdx = cleanContext.indexOf(target);
      if (innerIdx !== -1) {
        startIndex = ctxIdx + innerIdx;
      }
    }
  }

  // 2. Fallback: buscar la ocurrencia más cercana a hintOffset
  if (startIndex === -1) {
    let bestIdx = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let searchFrom = 0;

    while (searchFrom < cleanedBodyText.length) {
      const idx = cleanedBodyText.indexOf(target, searchFrom);
      if (idx === -1) break;
      const dist = Math.abs(idx - hintOffset);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIdx = idx;
      }
      searchFrom = idx + target.length;
    }

    startIndex = bestIdx;
  }

  if (startIndex === -1) return null;

  const endIndex = startIndex + target.length;
  const prefix = cleanedBodyText.slice(Math.max(0, startIndex - 24), startIndex);
  const suffix = cleanedBodyText.slice(endIndex, endIndex + 24);

  return {
    startOffset: startIndex,
    endOffset: endIndex,
    exactText: target,
    prefix,
    suffix,
  };
}

/**
 * Calcula coordenadas seguras para posicionar un popover dentro del viewport
 * sin desbordar por los bordes superior, inferior, izquierdo o derecho.
 */
export function clampPopoverCoordinates(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  popoverSize: { width: number; height: number } = { width: 260, height: 42 }
): { top: number; left: number } {
  const margin = 8;
  const preferAbove = rect.y > popoverSize.height + margin;
  const rawTop = preferAbove ? rect.y - popoverSize.height - 6 : rect.y + rect.height + 6;
  const top = Math.max(margin, Math.min(rawTop, viewport.height - popoverSize.height - margin));
  const left = Math.max(margin, Math.min(rect.x, viewport.width - popoverSize.width - margin));
  return { top, left };
}

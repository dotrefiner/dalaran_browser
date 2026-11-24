export interface HighlightAnnotation {
  id: string;
  selectedText: string;
}

/**
 * Pinta visualmente las citas anotadas en el documento en vivo usando la
 * CSS Custom Highlight API (`CSS.highlights`) sin mutar el DOM original.
 */
export function applyLiveHighlights(
  root: Node,
  annotations: HighlightAnnotation[],
  highlightName = 'dalaran-note-highlight'
): number {
  const cssRegistry = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS
    ?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight;

  if (!cssRegistry || !HighlightCtor || typeof document === 'undefined') {
    return 0;
  }

  const ranges: Range[] = [];
  const doc = root.ownerDocument ?? document;

  for (const ann of annotations) {
    const query = ann.selectedText.trim();
    if (!query) continue;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();
    while (currentNode) {
      const content = currentNode.textContent ?? '';
      const idx = content.indexOf(query);
      if (idx !== -1) {
        const range = doc.createRange();
        range.setStart(currentNode, idx);
        range.setEnd(currentNode, idx + query.length);
        ranges.push(range);
        break;
      }
      currentNode = walker.nextNode();
    }
  }

  if (ranges.length === 0) {
    cssRegistry.delete(highlightName);
    return 0;
  }

  const highlight = new HighlightCtor(...ranges);
  cssRegistry.set(highlightName, highlight);
  return ranges.length;
}

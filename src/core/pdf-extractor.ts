import { extractFromPlainText, type ExtractionResult } from './dom-extractor';

export interface PdfPageInput {
  pageNumber: number;
  text: string;
}

/**
 * Extrae y sanitiza texto de un documento PDF (lista de páginas extraídas por pdfjs-dist)
 * aplicando el mismo pipeline de limpieza y PII scrubbing que a páginas HTML.
 */
export function extractSafePdfContent(
  title: string,
  pages: PdfPageInput[],
  sourceUrl: string
): ExtractionResult {
  const combined = pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n');

  return extractFromPlainText(title, combined, sourceUrl);
}

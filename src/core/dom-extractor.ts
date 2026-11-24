import { Readability } from '@mozilla/readability';
import { scrubPii, type PiiCategory } from './pii-scrubber';

export interface ExtractionResult {
  title: string;
  cleanedText: string;
  isSensitive: boolean;
  sensitiveReason?: string;
  redactedCount: number;
  detectedPiiCategories: PiiCategory[];
  originalLength: number;
}

const SENSITIVE_URL_PARAMS = ['access_token=', 'id_token=', 'auth_token=', 'oauth_token='];
const PAYMENT_KEYWORDS = ['stripe', 'paypal', 'checkout', 'payment'];
const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  '[type="hidden"]',
  '[type="password"]',
  '[data-sensitive]',
  '.sensitive',
  '[aria-hidden="true"]',
];

/**
 * Detecta si una página contiene formularios de autenticación, campos de pago
 * o parámetros sensibles en la URL para pausar Smart Mode preventivamente.
 */
export function detectSensitiveContext(
  doc: Document,
  url: string
): { isSensitive: boolean; reason?: string } {
  const lowerUrl = url.toLowerCase();
  if (SENSITIVE_URL_PARAMS.some((param) => lowerUrl.includes(param))) {
    return {
      isSensitive: true,
      reason: 'La URL contiene parámetros de autenticación sensibles',
    };
  }

  if (doc.querySelector('input[type="password"]')) {
    return {
      isSensitive: true,
      reason: 'Página con formulario de contraseña activo',
    };
  }

  if (
    doc.querySelector(
      'input[autocomplete="cc-number"], input[autocomplete="cc-cvc"], input[autocomplete="cc-exp"]'
    )
  ) {
    return {
      isSensitive: true,
      reason: 'Página con formulario de tarjeta de pago',
    };
  }

  const hasPaymentMarker = PAYMENT_KEYWORDS.some((kw) => lowerUrl.includes(kw));
  const hasCreditCardForm = Boolean(doc.querySelector('form[action*="pay"], form[action*="checkout"]'));
  if (hasPaymentMarker && hasCreditCardForm) {
    return {
      isSensitive: true,
      reason: 'Pasarela de pago detectada',
    };
  }

  return { isSensitive: false };
}

/**
 * Clona y sanitiza un Document HTML eliminando elementos interactivos, scripts
 * y contenido sensible antes de extraer el artículo principal con Readability.
 */
export function extractSafeContent(doc: Document, url: string): ExtractionResult {
  const originalLength = doc.body?.innerHTML.length ?? 0;
  const sensitivity = detectSensitiveContext(doc, url);

  if (sensitivity.isSensitive) {
    return {
      title: doc.title || 'Página protegida',
      cleanedText: '',
      isSensitive: true,
      sensitiveReason: sensitivity.reason,
      redactedCount: 0,
      detectedPiiCategories: [],
      originalLength,
    };
  }

  // Clonar el documento para no mutar el DOM en vivo
  const clonedDoc = doc.cloneNode(true) as Document;

  for (const selector of STRIP_SELECTORS) {
    const nodes = clonedDoc.querySelectorAll(selector);
    for (const node of nodes) {
      node.remove();
    }
  }

  const reader = new Readability(clonedDoc);
  const article = reader.parse();

  const rawText = (article?.textContent ?? clonedDoc.body?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  const scrubbed = scrubPii(rawText);

  return {
    title: article?.title || doc.title || 'Sin título',
    cleanedText: scrubbed.sanitizedText,
    isSensitive: false,
    redactedCount: scrubbed.redactedCount,
    detectedPiiCategories: scrubbed.detectedCategories,
    originalLength,
  };
}

/**
 * Contrato unificado para documentos de texto plano (ej. extractos de PDF via pdfjs-dist).
 */
export function extractFromPlainText(
  title: string,
  plainText: string,
  _url: string
): ExtractionResult {
  const normalized = plainText.replace(/\s+/g, ' ').trim();
  const scrubbed = scrubPii(normalized);

  return {
    title: title || 'Documento sin título',
    cleanedText: scrubbed.sanitizedText,
    isSensitive: false,
    redactedCount: scrubbed.redactedCount,
    detectedPiiCategories: scrubbed.detectedCategories,
    originalLength: plainText.length,
  };
}

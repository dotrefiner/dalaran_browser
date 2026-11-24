export type PiiCategory = 'card' | 'id' | 'email' | 'phone' | 'token';

export interface ScrubResult {
  sanitizedText: string;
  redactedCount: number;
  detectedCategories: PiiCategory[];
}

/**
 * Verifica un número de tarjeta (13-19 dígitos) usando el algoritmo de Luhn.
 */
export function isValidLuhn(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;

  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = Number(digitsOnly[i]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

const TOKEN_PATTERNS: RegExp[] = [
  // JWT tokens (header.payload.signature)
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Bearer tokens en texto
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  // OpenAI / Stripe / GitHub / Google API keys comunes
  /\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35})\b/g,
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_OR_TAX_ID_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{4}\b/g;

/**
 * Enmascara información personal sensible (PII) y credenciales antes de
 * almacenar texto en caché o enviarlo a modelos de lenguaje externos.
 */
export function scrubPii(input: string): ScrubResult {
  if (!input) {
    return { sanitizedText: '', redactedCount: 0, detectedCategories: [] };
  }

  let text = input;
  let redactedCount = 0;
  const categories = new Set<PiiCategory>();

  // 1. Secretos y tokens de autenticación (prioridad máxima)
  for (const pattern of TOKEN_PATTERNS) {
    text = text.replace(pattern, () => {
      redactedCount++;
      categories.add('token');
      return '[REDACTED_TOKEN]';
    });
  }

  // 2. Tarjetas de crédito/débito verificadas con Luhn
  text = text.replace(CARD_CANDIDATE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    if (isValidLuhn(digits)) {
      redactedCount++;
      categories.add('card');
      return '[REDACTED_CARD_NUMBER]';
    }
    return match;
  });

  // 3. Correos electrónicos
  text = text.replace(EMAIL_PATTERN, () => {
    redactedCount++;
    categories.add('email');
    return '[REDACTED_EMAIL]';
  });

  // 4. Documentos de identidad (ej. SSN formato XXX-XX-XXXX)
  text = text.replace(SSN_OR_TAX_ID_PATTERN, () => {
    redactedCount++;
    categories.add('id');
    return '[REDACTED_ID]';
  });

  // 5. Números telefónicos
  text = text.replace(PHONE_PATTERN, () => {
    redactedCount++;
    categories.add('phone');
    return '[REDACTED_PHONE]';
  });

  return {
    sanitizedText: text,
    redactedCount,
    detectedCategories: Array.from(categories),
  };
}

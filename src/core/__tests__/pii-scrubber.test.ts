import { describe, expect, it } from 'vitest';
import { isValidLuhn, scrubPii } from '../pii-scrubber';

describe('pii-scrubber (TC-PII)', () => {
  it('TC-PII-01: enmascara números de tarjeta de crédito válidos según Luhn', () => {
    // 4532015112830366 es un número Visa de prueba válido por Luhn
    expect(isValidLuhn('4532015112830366')).toBe(true);
    expect(isValidLuhn('4532015112830367')).toBe(false);

    const input = 'Mi tarjeta es 4532 0151 1283 0366 y un número cualquiera 1234567890123.';
    const result = scrubPii(input);

    expect(result.sanitizedText).toContain('[REDACTED_CARD_NUMBER]');
    expect(result.sanitizedText).not.toContain('4532 0151 1283 0366');
    expect(result.detectedCategories).toContain('card');
  });

  it('TC-PII-02: enmascara emails, SSN/IDs y números telefónicos', () => {
    const input =
      'Contacto: juan.perez@ejemplo.com, Tel: +54 11 4567-8901, ID: 123-45-6789.';
    const result = scrubPii(input);

    expect(result.sanitizedText).toContain('[REDACTED_EMAIL]');
    expect(result.sanitizedText).toContain('[REDACTED_PHONE]');
    expect(result.sanitizedText).toContain('[REDACTED_ID]');
    expect(result.sanitizedText).not.toContain('juan.perez@ejemplo.com');
    expect(result.sanitizedText).not.toContain('123-45-6789');
    expect(result.redactedCount).toBe(3);
  });

  it('TC-PII-03: enmascara JWTs, Bearer tokens y API keys antes de salir de core/', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const ghToken = 'ghp_1234567890abcdefghij1234567890';
    const input = `Authorization: Bearer supersecrettoken12345678\nJWT: ${jwt}\nGH: ${ghToken}`;

    const result = scrubPii(input);

    expect(result.sanitizedText).not.toContain(jwt);
    expect(result.sanitizedText).not.toContain(ghToken);
    expect(result.sanitizedText).not.toContain('supersecrettoken12345678');
    expect(result.detectedCategories).toContain('token');
    expect(result.redactedCount).toBeGreaterThanOrEqual(3);
  });
});

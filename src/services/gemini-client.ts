import { GoogleGenAI } from '@google/genai';
import type { SiteContextSummary } from '../core/context-cache';
import { scrubPii } from '../core/pii-scrubber';

const FAST_MODEL = 'gemini-3.5-flash-lite';
const REASONING_MODEL = 'gemini-4-hydrogen';

export interface GeminiClientOptions {
  apiKey: string;
}

export class GeminiClient {
  private readonly ai: GoogleGenAI;

  constructor(options: GeminiClientOptions) {
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
  }

  /**
   * Pre-escanea el texto limpio para extraer temática y entidades clave en JSON.
   */
  async preScanDocument(
    cleanedText: string
  ): Promise<Omit<SiteContextSummary, 'url' | 'cachedAt'>> {
    const { sanitizedText } = scrubPii(cleanedText);
    const truncated = sanitizedText.slice(0, 12000);

    const response = await this.ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Analiza el siguiente texto y responde exclusivamente un JSON válido con las claves "topic" (resumen en 1-2 oraciones), "keyEntities" (array de hasta 6 conceptos clave) y "domainCategory" ("tecnologia" | "finanzas" | "medicina" | "literatura" | "general").\n\nTexto:\n${truncated}`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text ?? '{}';
    const parsed = JSON.parse(raw) as Partial<Omit<SiteContextSummary, 'url' | 'cachedAt'>>;

    return {
      topic: parsed.topic ?? 'Temática general del documento',
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
      domainCategory: parsed.domainCategory ?? 'general',
    };
  }

  /**
   * Explica un término seleccionado en el contexto de la temática cacheada.
   */
  async defineInContext(
    selectedText: string,
    surroundingContext: string,
    siteSummary?: SiteContextSummary
  ): Promise<string> {
    const safeSelection = scrubPii(selectedText).sanitizedText;
    const safeSurrounding = scrubPii(surroundingContext).sanitizedText;

    const topicHint = siteSummary
      ? `Temática del sitio: ${siteSummary.topic}. Conceptos clave: ${siteSummary.keyEntities.join(', ')}.`
      : '';

    const response = await this.ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Eres un asistente de lectura profunda. Explica de forma clara y concisa qué significa "${safeSelection}" dentro de este contexto.\n${topicHint}\nFragmento circundante: "${safeSurrounding}"`,
    });

    return response.text ?? '';
  }

  /**
   * Traduce el fragmento seleccionado al idioma objetivo respetando el contexto.
   */
  async translateSelection(
    selectedText: string,
    targetLanguage = 'español',
    siteSummary?: SiteContextSummary
  ): Promise<string> {
    const safeSelection = scrubPii(selectedText).sanitizedText;
    const topicHint = siteSummary ? `Contexto temático: ${siteSummary.topic}.` : '';

    const response = await this.ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Traduce fielmente al ${targetLanguage} el siguiente fragmento manteniendo su terminología técnica.\n${topicHint}\n\nTexto:\n${safeSelection}`,
    });

    return response.text ?? '';
  }

  /**
   * Genera una respuesta en streaming para el debate contextual (con store: false).
   */
  async *streamContextualChat(
    userQuestion: string,
    contextPayload: string
  ): AsyncGenerator<string, void, unknown> {
    const safeQuestion = scrubPii(userQuestion).sanitizedText;
    const safeContext = scrubPii(contextPayload).sanitizedText;

    const stream = await this.ai.models.generateContentStream({
      model: REASONING_MODEL,
      contents: `Contexto del documento:\n${safeContext}\n\nPregunta del usuario:\n${safeQuestion}`,
      config: {
        systemInstruction:
          'Eres un asistente de lectura profunda en Dalaran Browser. Responde con rigor, concisión y basándote en la evidencia del documento.',
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}

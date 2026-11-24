import type { SiteContextSummary } from './context-cache';
import type { NoteItem } from './markdown-engine';
import { scrubPii } from './pii-scrubber';

export type ChatScope = 'selection' | 'document';

export interface ChatContextInput {
  scope: ChatScope;
  selectedText?: string;
  cleanedBodyText: string;
  siteSummary?: SiteContextSummary | null;
  notes: NoteItem[];
}

/**
 * Ensambla dinámicamente el contexto para el chat reactivo inyectando
 * temática cacheada, notas previas de la sesión y el alcance elegido
 * (selección parcial o documento completo), garantizando sanitización PII.
 */
export function buildContextualPromptPayload(input: ChatContextInput): string {
  const sections: string[] = [];

  if (input.siteSummary) {
    sections.push(
      `Temática global: ${input.siteSummary.topic}\nEntidades clave: ${input.siteSummary.keyEntities.join(', ')}`
    );
  }

  if (input.scope === 'selection' && input.selectedText?.trim()) {
    sections.push(`Fragmento seleccionado:\n"${input.selectedText.trim()}"`);
  } else if (input.cleanedBodyText.trim()) {
    sections.push(`Contenido limpio del documento:\n${input.cleanedBodyText.slice(0, 16000)}`);
  }

  if (input.notes.length > 0) {
    const formattedNotes = input.notes
      .map((n, idx) => `${idx + 1}. Cita: "${n.selectedText}" -> Nota: ${n.userNote}`)
      .join('\n');
    sections.push(`Notas previas del usuario en esta sesión:\n${formattedNotes}`);
  }

  const rawPayload = sections.join('\n\n');
  return scrubPii(rawPayload).sanitizedText;
}

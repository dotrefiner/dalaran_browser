import { resolveTextPosition } from './selection-tracker';

export type ExportMode = 'clean' | 'annotated' | 'notes_only';

export interface NoteItem {
  id: string;
  selectedText: string;
  userNote: string;
  anchorId: string;
  startOffset: number;
  endOffset: number;
  timestamp: number;
}

export interface SessionMarkdownState {
  sourceUrl: string;
  pageTitle: string;
  cleanedBodyText: string;
  notes: NoteItem[];
  isIncognito: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Motor de Markdown Vivo con estado JSON en memoria, enlaces bidireccionales
 * y 3 modalidades de exportación reproducibles.
 */
export class MarkdownEngine {
  private state: SessionMarkdownState;

  constructor(initial: SessionMarkdownState) {
    this.state = {
      ...initial,
      notes: [...initial.notes],
    };
  }

  getState(): SessionMarkdownState {
    return {
      ...this.state,
      notes: [...this.state.notes],
    };
  }

  setIncognito(incognito: boolean): void {
    this.state.isIncognito = incognito;
  }

  addNote(
    selectedText: string,
    userNote: string,
    contextSurrounding?: string,
    hintOffset = 0
  ): NoteItem {
    const id = String(this.state.notes.length + 1);
    const position = resolveTextPosition(
      this.state.cleanedBodyText,
      selectedText,
      contextSurrounding,
      hintOffset
    );

    const startOffset = position?.startOffset ?? -1;
    const endOffset = position?.endOffset ?? -1;
    const slug = slugify(selectedText) || 'cita';

    const note: NoteItem = {
      id,
      selectedText: selectedText.trim(),
      userNote: userNote.trim(),
      anchorId: `nota-${slug}-${id}`,
      startOffset,
      endOffset,
      timestamp: Date.now(),
    };

    this.state.notes.push(note);
    return note;
  }

  updateNote(id: string, newUserNote: string): boolean {
    const target = this.state.notes.find((n) => n.id === id);
    if (!target) return false;
    target.userNote = newUserNote.trim();
    target.timestamp = Date.now();
    return true;
  }

  deleteNote(id: string): boolean {
    const before = this.state.notes.length;
    this.state.notes = this.state.notes.filter((n) => n.id !== id);
    return this.state.notes.length < before;
  }

  exportMarkdown(mode: ExportMode): string {
    if (mode === 'clean') {
      return this.state.cleanedBodyText;
    }

    if (mode === 'notes_only') {
      const header = `# Notas de lectura: [${this.state.pageTitle}](${this.state.sourceUrl})`;
      if (this.state.notes.length === 0) {
        return `${header}\n\n_Sin anotaciones registradas._`;
      }

      const blocks = this.state.notes.map(
        (n) => `> "${n.selectedText}"\n\n**Nota:** ${n.userNote}`
      );
      return `${header}\n\n${blocks.join('\n\n---\n\n')}`;
    }

    // Modo 2: Texto con anotaciones bidireccionales
    let annotatedBody = this.state.cleanedBodyText;

    // Insertar de atrás hacia adelante para no desplazar offsets previos
    const positioned = this.state.notes
      .filter((n) => n.startOffset >= 0 && n.endOffset > n.startOffset)
      .sort((a, b) => b.startOffset - a.startOffset);

    for (const note of positioned) {
      const before = annotatedBody.slice(0, note.startOffset);
      const exact = annotatedBody.slice(note.startOffset, note.endOffset);
      const after = annotatedBody.slice(note.endOffset);
      const linked = `<a id="ref-${note.id}"></a>[${exact}](#nota-${note.id}){: .smart-annotation}`;
      annotatedBody = `${before}${linked}${after}`;
    }

    if (this.state.notes.length === 0) {
      return annotatedBody;
    }

    const footnotes = this.state.notes
      .map(
        (n) =>
          `### Nota ${n.id}: ${n.selectedText} {#nota-${n.id}}\n\n${n.userNote}\n\n[↩ Volver al texto](#ref-${n.id})`
      )
      .join('\n\n');

    return `${annotatedBody}\n\n---\n\n## Notas\n\n${footnotes}`;
  }
}

import { useState } from 'preact/hooks';
import type { ExportMode, NoteItem } from '../core/markdown-engine';
import { activeSelection } from '../store/session-store';

export interface NoteEditorViewProps {
  notes: NoteItem[];
  onAddNote: (selectedText: string, userNote: string, contextSurrounding?: string, offset?: number) => void;
  onUpdateNote: (id: string, userNote: string) => void;
  onDeleteNote: (id: string) => void;
  onExportMarkdown: (mode: ExportMode) => Promise<void>;
}

export function NoteEditorView({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onExportMarkdown,
}: NoteEditorViewProps) {
  const [draftNote, setDraftNote] = useState('');
  const [exportMode, setExportMode] = useState<ExportMode>('annotated');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const selection = activeSelection.value;

  const handleSaveNew = (e: Event) => {
    e.preventDefault();
    if (!selection || !draftNote.trim()) return;
    onAddNote(
      selection.selectedText,
      draftNote.trim(),
      selection.contextSurrounding,
      selection.anchorOffset
    );
    setDraftNote('');
  };

  const handleExport = async () => {
    setExportStatus(null);
    try {
      await onExportMarkdown(exportMode);
      setExportStatus('Archivo Markdown exportado correctamente.');
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Error al exportar Markdown');
    }
  };

  return (
    <div class="note-editor-view">
      {selection && (
        <form class="new-note-form" onSubmit={handleSaveNew}>
          <blockquote class="selected-quote">“{selection.selectedText}”</blockquote>
          <textarea
            rows={3}
            value={draftNote}
            placeholder="Escribe tu nota vinculada a esta cita..."
            onInput={(e) => setDraftNote((e.target as HTMLTextAreaElement).value)}
          />
          <button type="submit" class="primary-btn">
            Guardar Nota
          </button>
        </form>
      )}

      <div class="notes-list">
        <h4>Anotaciones ({notes.length})</h4>
        {notes.length === 0 && <p class="muted-text">Aún no hay notas en esta sesión.</p>}
        {notes.map((note) => (
          <div key={note.id} class="note-card">
            <blockquote class="note-quote">“{note.selectedText}”</blockquote>
            {editingId === note.id ? (
              <div class="note-edit-row">
                <textarea
                  rows={2}
                  value={editingText}
                  onInput={(e) => setEditingText((e.target as HTMLTextAreaElement).value)}
                />
                <div class="note-actions">
                  <button
                    type="button"
                    class="primary-btn"
                    onClick={() => {
                      onUpdateNote(note.id, editingText);
                      setEditingId(null);
                    }}
                  >
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p class="note-body">{note.userNote}</p>
                <div class="note-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditingText(note.userNote);
                    }}
                  >
                    Editar
                  </button>
                  <button type="button" onClick={() => onDeleteNote(note.id)}>
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div class="export-controls">
        <label for="export-mode-select">Modalidad de exportación (.md):</label>
        <div class="export-row">
          <select
            id="export-mode-select"
            value={exportMode}
            onChange={(e) => setExportMode((e.target as HTMLSelectElement).value as ExportMode)}
          >
            <option value="clean">Modo 1: Texto limpio</option>
            <option value="annotated">Modo 2: Texto con anotaciones</option>
            <option value="notes_only">Modo 3: Solo anotaciones</option>
          </select>
          <button type="button" class="primary-btn" onClick={() => void handleExport()}>
            Exportar .md
          </button>
        </div>
        {exportStatus && <p class="status-text">{exportStatus}</p>}
      </div>
    </div>
  );
}

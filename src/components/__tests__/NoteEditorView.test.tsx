import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { activeSelection } from '../../store/session-store';
import { NoteEditorView } from '../NoteEditorView';

describe('NoteEditorView', () => {
  it('permite crear una nota vinculada y exportar en la modalidad seleccionada', async () => {
    activeSelection.value = {
      selectedText: 'arquitectura hexagonal',
      contextSurrounding: 'La arquitectura hexagonal es útil.',
      rect: { x: 10, y: 10, width: 50, height: 15 },
      anchorOffset: 3,
    };

    const onAddNote = vi.fn();
    const onExportMarkdown = vi.fn().mockResolvedValue(undefined);

    render(
      <NoteEditorView
        notes={[]}
        onAddNote={onAddNote}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onExportMarkdown={onExportMarkdown}
      />
    );

    const textarea = screen.getByPlaceholderText('Escribe tu nota vinculada a esta cita...');
    fireEvent.input(textarea, { target: { value: 'Separación clara de puertos' } });
    fireEvent.click(screen.getByText('Guardar Nota'));

    expect(onAddNote).toHaveBeenCalledWith(
      'arquitectura hexagonal',
      'Separación clara de puertos',
      'La arquitectura hexagonal es útil.',
      3
    );

    const select = screen.getByLabelText('Modalidad de exportación (.md):');
    fireEvent.change(select, { target: { value: 'notes_only' } });
    fireEvent.click(screen.getByText('Exportar .md'));

    expect(onExportMarkdown).toHaveBeenCalledWith('notes_only');
  });
});

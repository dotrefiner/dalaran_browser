import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { activeSelection } from '../../store/session-store';
import { ContextualChat } from '../ContextualChat';

describe('ContextualChat', () => {
  it('inicia de forma orgánica sin sugerencias precocinadas y renderiza streaming seguro', async () => {
    activeSelection.value = {
      selectedText: 'entropía',
      contextSurrounding: 'La entropía mide incertidumbre.',
      rect: { x: 0, y: 0, width: 40, height: 15 },
      anchorOffset: 3,
    };

    const onSendMessage = vi.fn(async (_q, _scope, onChunk) => {
      onChunk('Respuesta ');
      onChunk('en streaming<script>alert(1)</script>.');
    });

    render(<ContextualChat onSendMessage={onSendMessage} />);

    // No debe haber burbujas ni sugerencias precocinadas al abrirse
    expect(screen.queryByText('Dalaran IA')).toBeNull();

    const input = screen.getByPlaceholderText('Escribe tu consulta sobre el texto...');
    fireEvent.input(input, { target: { value: '¿Por qué es importante?' } });
    fireEvent.click(screen.getByText('Enviar'));

    await waitFor(() => {
      expect(screen.getByText('Dalaran IA')).toBeDefined();
    });

    expect(onSendMessage).toHaveBeenCalledWith(
      '¿Por qué es importante?',
      'selection',
      expect.any(Function)
    );
    expect(screen.getByText(/Respuesta en streaming/)).toBeDefined();
    // Verifica sanitización XSS con DOMPurify
    expect(document.querySelector('script')).toBeNull();
  });
});

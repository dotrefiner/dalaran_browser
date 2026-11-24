import DOMPurify from 'dompurify';
import { useState } from 'preact/hooks';
import type { ChatScope } from '../core/chat-context';
import { activeSelection } from '../store/session-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextualChatProps {
  onSendMessage: (
    question: string,
    scope: ChatScope,
    onChunk: (partial: string) => void
  ) => Promise<void>;
}

/**
 * Chat contextual reactivo en streaming.
 * Comportamiento orgánico: no sugiere preguntas precocinadas al abrirse;
 * permanece en espera pasiva de la inquietud del usuario.
 */
export function ContextualChat({ onSendMessage }: ContextualChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<ChatScope>(
    activeSelection.value ? 'selection' : 'document'
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = activeSelection.value;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
    };
    const assistantId = `a-${Date.now() + 1}`;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    try {
      let accumulated = '';
      await onSendMessage(question, scope, (chunk) => {
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando respuesta en streaming');
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div class="contextual-chat">
      <div class="chat-scope-bar">
        <label for="chat-scope-select">Alcance:</label>
        <select
          id="chat-scope-select"
          value={scope}
          onChange={(e) => setScope((e.target as HTMLSelectElement).value as ChatScope)}
        >
          <option value="selection" disabled={!selection}>
            Selección actual
          </option>
          <option value="document">Documento completo</option>
        </select>
      </div>

      {scope === 'selection' && selection && (
        <blockquote class="selected-quote">“{selection.selectedText}”</blockquote>
      )}

      <div class="chat-messages" aria-live="polite">
        {messages.map((msg) => {
          const safeHtml = DOMPurify.sanitize(msg.content);
          return (
            <div key={msg.id} class={`chat-bubble ${msg.role}`}>
              <span class="chat-role">{msg.role === 'user' ? 'Tú' : 'Dalaran IA'}</span>
              <div
                class="chat-text"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            </div>
          );
        })}
      </div>

      {error && <p class="error-text">{error}</p>}

      <form class="chat-input-form" onSubmit={(e) => void handleSubmit(e)}>
        <input
          type="text"
          value={input}
          disabled={isStreaming}
          placeholder="Escribe tu consulta sobre el texto..."
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="primary-btn" disabled={isStreaming}>
          {isStreaming ? 'Generando…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}

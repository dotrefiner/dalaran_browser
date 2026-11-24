import DOMPurify from 'dompurify';
import {
  activeContextSummary,
  activeSelection,
  isPanelLoading,
  panelError,
  panelOutputText,
} from '../store/session-store';

export function DefinitionView() {
  const selection = activeSelection.value;
  const summary = activeContextSummary.value;
  const sanitizedOutput = DOMPurify.sanitize(panelOutputText.value);

  return (
    <div class="definition-view">
      {selection && (
        <blockquote class="selected-quote">
          “{selection.selectedText}”
        </blockquote>
      )}

      {summary && (
        <div class="context-pill">
          <strong>Contexto:</strong> {summary.topic}
        </div>
      )}

      {isPanelLoading.value && <p class="loading-text">Analizando en contexto…</p>}
      {panelError.value && <p class="error-text">{panelError.value}</p>}

      {!isPanelLoading.value && sanitizedOutput && (
        <div
          class="ai-output"
          // Contenido sanitizado obligatoriamente con DOMPurify (Sección 6.3)
          dangerouslySetInnerHTML={{ __html: sanitizedOutput }}
        />
      )}
    </div>
  );
}

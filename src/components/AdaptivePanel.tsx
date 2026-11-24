import type { ComponentChildren } from 'preact';
import { panelMode } from '../store/session-store';

export interface AdaptivePanelProps {
  isMobile: boolean;
  children: ComponentChildren;
}

export function AdaptivePanel({ isMobile, children }: AdaptivePanelProps) {
  if (panelMode.value === 'closed') return null;

  return (
    <aside
      class={`adaptive-panel ${isMobile ? 'bottom-drawer' : 'side-panel'}`}
      aria-label="Panel contextual de lectura"
    >
      <div class="panel-header">
        <span class="panel-title">
          {panelMode.value === 'definition' && 'Definición Contextual'}
          {panelMode.value === 'translation' && 'Traducción Contextual'}
          {panelMode.value === 'notes' && 'Notas de Lectura'}
          {panelMode.value === 'chat' && 'Debate Contextual'}
        </span>
        <button
          type="button"
          class="close-btn"
          aria-label="Cerrar panel"
          onClick={() => {
            panelMode.value = 'closed';
          }}
        >
          ✕
        </button>
      </div>
      <div class="panel-body">{children}</div>
    </aside>
  );
}

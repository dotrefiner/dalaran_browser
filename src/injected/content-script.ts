import type { TextSelectionPayload } from '../platform/bridge';

export type PopoverAction = 'define' | 'translate' | 'note' | 'chat';

export interface ContentScriptHost {
  emitSelection: (payload: TextSelectionPayload) => void;
  toggleSmartModeShortcut?: () => void;
  focusUrlBarShortcut?: () => void;
}

const POPOVER_HOST_ID = 'dalaran-selection-popover-host';

/**
 * Monta el popover flotante en un Shadow DOM cerrado (`mode: 'closed'`)
 * para evitar conflictos de CSS/z-index con la página anfitriona y WebViews nativos.
 */
export function createClosedShadowPopover(
  onAction: (action: PopoverAction) => void
): {
  show: (rect: { x: number; y: number; width: number; height: number }) => void;
  hide: () => void;
  destroy: () => void;
} {
  const host = document.createElement('div');
  host.id = POPOVER_HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.display = 'none';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .popover {
      display: flex;
      gap: 4px;
      padding: 4px 6px;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
    }
    button {
      background: transparent;
      color: inherit;
      border: none;
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
    }
    button:hover {
      background: #27272a;
    }
  `;

  const container = document.createElement('div');
  container.className = 'popover';

  const actions: Array<{ id: PopoverAction; label: string }> = [
    { id: 'define', label: 'Definir' },
    { id: 'translate', label: 'Traducir' },
    { id: 'note', label: 'Nota' },
    { id: 'chat', label: 'Debate' },
  ];

  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = act.label;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAction(act.id);
    });
    container.appendChild(btn);
  }

  shadow.appendChild(style);
  shadow.appendChild(container);
  document.body.appendChild(host);

  return {
    show(rect) {
      const top = rect.y > 48 ? rect.y - 42 : rect.y + rect.height + 8;
      const left = Math.max(8, Math.min(rect.x, window.innerWidth - 260));
      host.style.top = `${top}px`;
      host.style.left = `${left}px`;
      host.style.display = 'block';
    },
    hide() {
      host.style.display = 'none';
    },
    destroy() {
      host.remove();
    },
  };
}

/**
 * Inicializa la captura segura de selección (throttled >= 150ms) y atajos Keyboard-First.
 */
export function initContentScript(hostApi: ContentScriptHost): () => void {
  let latestSelection: TextSelectionPayload | null = null;
  let throttleTimer: number | null = null;

  const popover = createClosedShadowPopover((action) => {
    if (latestSelection) {
      hostApi.emitSelection({ ...latestSelection, action });
      popover.hide();
    }
  });

  const captureSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!sel || sel.rangeCount === 0 || !text) {
      latestSelection = null;
      popover.hide();
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const surrounding = range.startContainer.textContent ?? text;

    latestSelection = {
      selectedText: text,
      contextSurrounding: surrounding.slice(0, 600),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      anchorOffset: range.startOffset,
    };

    popover.show(latestSelection.rect);
  };

  const onMouseUp = () => {
    if (throttleTimer !== null) {
      window.clearTimeout(throttleTimer);
    }
    throttleTimer = window.setTimeout(captureSelection, 150);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      hostApi.focusUrlBarShortcut?.();
      return;
    }

    if (!e.altKey) return;
    const key = e.key.toLowerCase();

    if (key === 's') {
      e.preventDefault();
      hostApi.toggleSmartModeShortcut?.();
    } else if (latestSelection) {
      const actionMap: Record<string, PopoverAction> = {
        d: 'define',
        t: 'translate',
        n: 'note',
        c: 'chat',
      };
      const mapped = actionMap[key];
      if (mapped) {
        e.preventDefault();
        hostApi.emitSelection({ ...latestSelection, action: mapped });
        popover.hide();
      }
    }
  };

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    if (throttleTimer !== null) {
      window.clearTimeout(throttleTimer);
    }
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    popover.destroy();
  };
}

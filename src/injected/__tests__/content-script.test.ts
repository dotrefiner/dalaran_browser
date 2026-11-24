import { describe, expect, it, vi } from 'vitest';
import { createClosedShadowPopover } from '../content-script';

describe('content-script Shadow DOM isolation (TC-SEL-04)', () => {
  it('monta el popover en Shadow DOM cerrado inaccesible desde la página anfitriona', () => {
    const onAction = vi.fn();
    const popover = createClosedShadowPopover(onAction);

    const hostEl = document.getElementById('dalaran-selection-popover-host');
    expect(hostEl).not.toBeNull();
    // mode: 'closed' garantiza que element.shadowRoot retorne null a scripts de terceros
    expect(hostEl?.shadowRoot).toBeNull();

    popover.show({ x: 100, y: 100, width: 50, height: 20 });
    expect(hostEl?.style.display).toBe('block');

    popover.hide();
    expect(hostEl?.style.display).toBe('none');

    popover.destroy();
    expect(document.getElementById('dalaran-selection-popover-host')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { MarkdownEngine } from '../markdown-engine';

describe('markdown-engine (TC-MD)', () => {
  const sampleText =
    'La termodinámica estudia la entropía en sistemas cerrados. La información también posee una medida de incertidumbre llamada entropía digital.';

  it('TC-MD-01: genera anclas bidireccionales en el cuerpo y en el pie de notas', () => {
    const engine = new MarkdownEngine({
      sourceUrl: 'https://ejemplo.com/entropia',
      pageTitle: 'Sobre la Entropía',
      cleanedBodyText: sampleText,
      notes: [],
      isIncognito: false,
    });

    const n1 = engine.addNote('termodinámica', 'Rama clave de la física.', 'La termodinámica estudia');
    const n2 = engine.addNote('incertidumbre', 'Concepto central en Shannon.');

    const md = engine.exportMarkdown('annotated');
    expect(md).toContain(`[termodinámica](#nota-${n1.id}){: .smart-annotation}`);
    expect(md).toContain(`[incertidumbre](#nota-${n2.id}){: .smart-annotation}`);
    expect(md).toContain(`### Nota ${n1.id}: termodinámica {#nota-${n1.id}}`);
    expect(md).toContain(`[↩ Volver al texto](#ref-${n1.id})`);
    expect(md).toContain(`[↩ Volver al texto](#ref-${n2.id})`);
  });

  it('TC-MD-02: respeta las 3 modalidades de exportación (clean, annotated, notes_only)', () => {
    const engine = new MarkdownEngine({
      sourceUrl: 'https://ejemplo.com/entropia',
      pageTitle: 'Sobre la Entropía',
      cleanedBodyText: sampleText,
      notes: [],
      isIncognito: false,
    });

    engine.addNote('sistemas cerrados', 'No intercambian materia.');

    const clean = engine.exportMarkdown('clean');
    expect(clean).toBe(sampleText);

    const annotated = engine.exportMarkdown('annotated');
    expect(annotated).toContain('## Notas');
    expect(annotated).toContain('No intercambian materia.');

    const notesOnly = engine.exportMarkdown('notes_only');
    expect(notesOnly).toContain('# Notas de lectura: [Sobre la Entropía](https://ejemplo.com/entropia)');
    expect(notesOnly).toContain('> "sistemas cerrados"');
    expect(notesOnly).toContain('**Nota:** No intercambian materia.');
    expect(notesOnly).not.toContain('La información también posee');
  });

  it('TC-MD-03: edita y elimina notas sin corromper el texto base ni los demás offsets', () => {
    const engine = new MarkdownEngine({
      sourceUrl: 'https://ejemplo.com/entropia',
      pageTitle: 'Sobre la Entropía',
      cleanedBodyText: sampleText,
      notes: [],
      isIncognito: false,
    });

    const n1 = engine.addNote('termodinámica', 'Nota inicial');
    const n2 = engine.addNote('incertidumbre', 'Segunda nota');

    expect(engine.updateNote(n1.id, 'Nota editada')).toBe(true);
    expect(engine.deleteNote(n2.id)).toBe(true);

    const md = engine.exportMarkdown('annotated');
    expect(md).toContain('Nota editada');
    expect(md).not.toContain('Segunda nota');
    expect(engine.exportMarkdown('clean')).toBe(sampleText);
  });
});

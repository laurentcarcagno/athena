import { useState, type DragEvent } from 'react';
import { Btn } from '@athena/ui';
import { fr } from '../i18n';
import {
  addSection, autoLayout, moveField, moveSection, placeField, removeField, removeSection, renameSection, sanitize, setSpan, unplaced,
  type FieldLite, type Layout, type Span,
} from '../lib/layout';

const DRAG = 'application/x-athena-layout-field';
const LONG = new Set(['richtext', 'multiselect']);

/** Aperçu d'un attribut : même grille et mêmes proportions que la fiche, avec un faux contrôle du bon gabarit. */
function Fake({ field }: { field: FieldLite }) {
  return <div className={`ath-layout-fake${field.type === 'richtext' ? ' ath-layout-fake--tall' : ''}`} aria-hidden="true" />;
}

/**
 * Éditeur de la disposition de la vue détails. Automatique par défaut ; « Personnaliser » ouvre un éditeur WYSIWYG :
 * glisser-déposer, ou boutons (reculer, avancer, largeur, section) pour le clavier et les lecteurs d'écran.
 */
export function LayoutEditor({ fields, value, onChange }: { fields: FieldLite[]; value: Layout | null; onChange: (next: Layout | null) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const titles = { general: fr.layout.general, details: fr.layout.details, others: fr.layout.others };
  const custom = value !== null;
  const layout = custom ? sanitize(value, fields) : autoLayout(fields, titles);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const rest = unplaced(layout, fields);
  const label = (key: string) => byKey.get(key)?.label ?? key;
  const edit = (next: Layout) => onChange(next);
  const sectionName = (i: number) => layout.sections[i]!.title.trim() || fr.layout.untitled(i + 1);

  const drop = (event: DragEvent, section: number, before?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const key = event.dataTransfer.getData(DRAG) || dragging;
    setDragging(null);
    if (key) edit(placeField(layout, key, section, before, LONG.has(byKey.get(key)?.type ?? '') ? 3 : undefined));
  };
  const dragProps = (key: string) => ({ draggable: true, onDragStart: (e: DragEvent) => { e.dataTransfer.setData(DRAG, key); e.dataTransfer.effectAllowed = 'move'; setDragging(key); }, onDragEnd: () => setDragging(null) });

  return (
    <div className="ath-stack">
      <div className="ath-row">
        <span className="ath-eyebrow" role="status">{custom ? fr.layout.customNote : fr.layout.autoNote}</span>
        {custom
          ? <Btn size="sm" variant="ghost" onClick={() => onChange(null)}>{fr.layout.backToAuto}</Btn>
          : <Btn size="sm" onClick={() => onChange(autoLayout(fields, titles))}>{fr.layout.customize}</Btn>}
      </div>

      {layout.sections.map((section, si) => (
        <section key={si} className="ath-layout-section" aria-label={sectionName(si)}>
          {custom ? (
            <div className="ath-layout-section__head">
              <input className="ath-input" aria-label={fr.layout.sectionTitle(si + 1)} placeholder={fr.layout.untitled(si + 1)} maxLength={100} value={section.title} onChange={(e) => edit(renameSection(layout, si, e.target.value))} />
              <Btn size="sm" variant="ghost" aria-label={`${fr.layout.sectionUp} ${sectionName(si)}`} disabled={si === 0} onClick={() => edit(moveSection(layout, si, -1))}>▲</Btn>
              <Btn size="sm" variant="ghost" aria-label={`${fr.layout.sectionDown} ${sectionName(si)}`} disabled={si === layout.sections.length - 1} onClick={() => edit(moveSection(layout, si, 1))}>▼</Btn>
              <Btn icon="trash" size="sm" variant="ghost" aria-label={`${fr.layout.removeSection} ${sectionName(si)}`} onClick={() => edit(removeSection(layout, si))}>{fr.layout.removeSection}</Btn>
            </div>
          ) : section.title && <h3 className="ath-label">{section.title}</h3>}

          <ul className={`ath-layout-grid${custom ? ' ath-layout-grid--edit' : ''}`} onDragOver={custom ? (e) => e.preventDefault() : undefined} onDrop={custom ? (e) => drop(e, si) : undefined}>
            {section.fields.map((f) => {
              const field = byKey.get(f.key)!;
              return (
                <li key={f.key} className={`ath-layout-tile ath-span-${f.span}${dragging === f.key ? ' ath-layout-tile--drag' : ''}`}
                  {...(custom ? { ...dragProps(f.key), onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => drop(e, si, f.key) } : {})}>
                  <div className="ath-layout-tile__head"><span className="ath-layout-tile__label">{field.label}</span><span className="ath-mono ath-layout-tile__type">{field.type}</span></div>
                  <Fake field={field} />
                  {custom && (
                    <div className="ath-layout-tile__controls">
                      <div role="group" aria-label={`${fr.layout.width} ${field.label}`} className="ath-layout-tile__group">
                        {([1, 2, 3] as Span[]).map((n) => (
                          <Btn key={n} size="sm" variant={f.span === n ? 'deep' : 'ghost'} aria-pressed={f.span === n} aria-label={`${field.label} : ${fr.layout.columns(n)}`} onClick={() => edit(setSpan(layout, f.key, n))}>{n}/3</Btn>
                        ))}
                      </div>
                      <Btn size="sm" variant="ghost" aria-label={`${fr.layout.earlier} ${field.label}`} onClick={() => edit(moveField(layout, f.key, -1))}>◀</Btn>
                      <Btn size="sm" variant="ghost" aria-label={`${fr.layout.later} ${field.label}`} onClick={() => edit(moveField(layout, f.key, 1))}>▶</Btn>
                      {layout.sections.length > 1 && (
                        <select className="ath-select" aria-label={`${fr.layout.moveTo} : ${field.label}`} value={si} onChange={(e) => edit(placeField(layout, f.key, Number(e.target.value)))}>
                          {layout.sections.map((_, i) => <option key={i} value={i}>{sectionName(i)}</option>)}
                        </select>
                      )}
                      <Btn size="sm" variant="ghost" aria-label={`${fr.layout.unplace} ${field.label}`} onClick={() => edit(removeField(layout, f.key))}>×</Btn>
                    </div>
                  )}
                </li>
              );
            })}
            {custom && section.fields.length === 0 && <li className="ath-layout-empty">{fr.layout.emptySection}</li>}
          </ul>
        </section>
      ))}

      {custom && (
        <>
          <div><Btn size="sm" variant="ghost" disabled={layout.sections.length >= 20} onClick={() => edit(addSection(layout))}>{fr.layout.addSection}</Btn></div>
          <div className="ath-layout-section" role="group" aria-label={fr.layout.unplaced}>
            <h3 className="ath-label">{fr.layout.unplaced}</h3>
            {rest.length === 0 ? <p>{fr.layout.allPlaced}</p> : (
              <ul className="ath-taglist">
                {rest.map((f) => (
                  <li key={f.key} className="ath-layout-chip" {...dragProps(f.key)}>
                    <span>{f.label}</span>
                    <Btn size="sm" variant="ghost" aria-label={`${fr.layout.place} ${f.label}`} onClick={() => edit(placeField(layout, f.key, layout.sections.length - 1, undefined, LONG.has(f.type) ? 3 : 1))}>{fr.layout.place}</Btn>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="ath-eyebrow">{fr.layout.dragHint}</p>
        </>
      )}
    </div>
  );
}

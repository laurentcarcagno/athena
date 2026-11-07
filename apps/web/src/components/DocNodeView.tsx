import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, StatusPill, Tag } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface DocTreeNode { uid: string | null; type: string; title: string; statement: string; status: string; depth: number; parentUid: string | null; position: number; citations: number }
export interface Citation { key: string; tracker: string; title: string; status: string; category: string; suspect: boolean; origin: 'athena' | 'document' }

/** Ancre d'un nœud : son UID, ou une ancre de position pour une section ou un texte sans UID. */
export const anchorOf = (n: Pick<DocTreeNode, 'uid' | 'position'>): string => n.uid ?? `n-${n.position}`;

const pillKind = (category: string) => (category === 'done' ? 'success' : category === 'in_progress' ? 'warning' : 'default');

/**
 * Un nœud de document en lecture seule. Le texte vient de l'API déjà assaini et s'affiche comme du texte (jamais comme du HTML).
 * Une exigence montre ses citations : le nombre dans la liste, le détail (artefact, état, lien suspect) dans son panneau.
 */
export function DocNodeView({ node, project, source, selected }: { node: DocTreeNode; project: string; source: string; selected: boolean }) {
  const t = fr.docs;
  const fail = useFailure();
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [open, setOpen] = useState(false);
  const level = Math.min(3 + node.depth, 6) as 3 | 4 | 5 | 6;
  const Heading = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6';
  const id = anchorOf(node);

  const toggle = async () => {
    if (!node.uid) return;
    if (!open && citations === null) {
      try { setCitations(await api<Citation[]>('GET', `/v1/projects/${project}/docs/nodes/${encodeURIComponent(node.uid)}/citations?source=${encodeURIComponent(source)}`)); } catch (error) { fail(error); return; }
    }
    setOpen(!open);
  };

  if (node.type === 'SECTION') return <section id={id} className={`ath-doc__section ath-doc__depth-${Math.min(node.depth, 4)}`} aria-labelledby={`${id}-t`}><Heading id={`${id}-t`} className="ath-doc__heading">{node.uid && <span className="ath-mono ath-doc__uid">{node.uid}</span>} {node.title}</Heading></section>;
  if (node.type === 'TEXT') return <p id={id} className={`ath-doc__text ath-doc__depth-${Math.min(node.depth, 4)}`}>{node.statement}</p>;
  return (
    <article id={id} className={`ath-doc__req ath-doc__depth-${Math.min(node.depth, 4)}${selected ? ' ath-doc__req--selected' : ''}`} aria-current={selected ? 'location' : undefined} aria-labelledby={`${id}-t`}>
      <Heading id={`${id}-t`} className="ath-doc__heading">{node.uid && <span className="ath-mono ath-doc__uid">{node.uid}</span>} {node.title}</Heading>
      {node.status && <Tag variant="ghost">{node.status}</Tag>}
      {node.statement && <p className="ath-doc__text">{node.statement}</p>}
      {node.uid && node.type === 'REQUIREMENT' && (
        <div className="ath-stack">
          <Btn size="sm" variant="ghost" aria-expanded={open} aria-controls={`${id}-cit`} onClick={() => void toggle()}>{t.citations(node.citations)}</Btn>
          {open && (
            <div id={`${id}-cit`} role="region" aria-label={t.citationsOf(node.uid)}>
              {citations && citations.length === 0 ? <p>{t.noCitation}</p> : (
                <ul className="ath-stack">
                  {(citations ?? []).map((c) => (
                    <li key={c.key} className="ath-row">
                      <Link className="ath-link ath-mono" to={`/p/${project}/a/${c.key}`}>{c.key}</Link>
                      <span className="ath-clip" title={c.title}>{c.title}</span>
                      <StatusPill kind={pillKind(c.category)}>{c.status}</StatusPill>
                      {c.suspect && <Tag variant="accent">{t.suspect}</Tag>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

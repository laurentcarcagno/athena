import { Link } from 'react-router-dom';
import { fr } from '../i18n';
import { anchorOf, type DocTreeNode } from './DocNodeView';

/** Plan du document : sections et exigences dans l'ordre de lecture, indentées par profondeur, chacune liée à son ancre `#UID`. */
export function DocTree({ project, doc, nodes, selected }: { project: string; doc: string; nodes: DocTreeNode[]; selected: string | null }) {
  const outline = nodes.filter((n) => n.type === 'SECTION' || n.type === 'REQUIREMENT');
  if (outline.length === 0) return null;
  return (
    <nav aria-label={fr.docs.outline}>
      <ul className="ath-doc__outline">
        {outline.map((n) => {
          const a = anchorOf(n);
          return (
            <li key={a} className={`ath-doc__depth-${Math.min(n.depth, 4)}`}>
              <Link className="ath-link" to={`/p/${project}/documents/${doc}#${encodeURIComponent(a)}`} aria-current={selected === a ? 'location' : undefined}>
                {n.uid && <span className="ath-mono">{n.uid} </span>}{n.title || fr.docs.untitled}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Id, StatusPill, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface DocLinkRow { source: string; docId: string | null; uid: string; title: string; status: string; suspect: boolean; orphan: boolean }
interface Hit { uid: string; document: string; docId: string; title: string; snippet: string; match: string }

/**
 * Citations d'exigences documentaires d'un artefact : liste (avec lien vers le document), acquittement d'un lien suspect (la version
 * actuelle de l'exigence devient la référence, audité) et sélecteur à autocomplétion par UID ou titre. Fonctionne sur tout tracker.
 */
export function DocRefPicker({ project, itemKey, links, onChanged }: { project: string; itemKey: string; links: DocLinkRow[]; onChanged: () => void | Promise<void> }) {
  const t = fr.docRef;
  const toast = useToast();
  const fail = useFailure();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return undefined; }
    const timer = setTimeout(() => {
      api<Hit[]>('GET', `/v1/projects/${project}/docs/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.filter((h) => !links.some((l) => l.uid === h.uid && l.source === h.docId.split('.')[0]))))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, project, links]);

  const cite = async (hit: Hit) => {
    try {
      await api('POST', `/v1/projects/${project}/artifacts/${itemKey}/doc-links`, { source: hit.docId.split('.')[0], uid: hit.uid });
      toast('success', t.cited(hit.uid));
      setQuery(''); setHits([]);
      await onChanged();
    } catch (error) { fail(error); }
  };
  const acknowledge = async (row: DocLinkRow) => {
    try { await api('POST', `/v1/projects/${project}/artifacts/${itemKey}/doc-links/${encodeURIComponent(row.source)}/${encodeURIComponent(row.uid)}/acknowledge`); toast('success', t.acknowledged); await onChanged(); } catch (error) { fail(error); }
  };

  return (
    <section className="ath-stack" aria-label={t.title}>
      <span className="ath-eyebrow">{t.title}</span>
      {links.length === 0 ? <p>{t.none}</p> : (
        <ul className="ath-stack" aria-label={t.title}>
          {links.map((d) => (
            <li key={`${d.source}:${d.uid}`} className="ath-row">
              <Id>{d.uid}</Id> <span className="ath-clip" title={d.title}>{d.title}</span>
              {d.suspect && <StatusPill kind="warning">{fr.artifact.suspect}</StatusPill>}
              {d.orphan && <StatusPill kind="danger">{fr.artifact.absent}</StatusPill>}
              {!d.orphan && d.docId && <Link className="ath-link" to={`/p/${project}/documents/${d.docId}#${encodeURIComponent(d.uid)}`} aria-label={`${t.openIn} ${d.uid}`}>{t.openIn}</Link>}
              {d.suspect && !d.orphan && <Btn size="sm" variant="ghost" aria-label={`${t.acknowledge} ${d.uid}`} onClick={() => void acknowledge(d)}>{t.acknowledge}</Btn>}
            </li>
          ))}
        </ul>
      )}
      <div className="ath-field">
        <label className="ath-field__label" htmlFor="docref-q">{t.label}</label>
        <input id="docref-q" className="ath-input ath-mono" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.placeholder} maxLength={200} autoComplete="off" />
      </div>
      {hits.length > 0 && (
        <ul className="ath-stack" aria-label={t.suggestions(hits.length)}>
          {hits.map((h) => (
            <li key={`${h.docId}:${h.uid}`} className="ath-row">
              <Btn size="sm" variant="ghost" aria-label={`${t.cite} ${h.uid}`} onClick={() => void cite(h)}>{t.cite}</Btn>
              <Id>{h.uid}</Id> <span className="ath-clip" title={h.title}>{h.title}</span> <span className="ath-eyebrow">{h.document}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

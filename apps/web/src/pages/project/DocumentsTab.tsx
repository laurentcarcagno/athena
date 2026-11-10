import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Tag } from '@athena/ui';
import { api } from '../../api';
import { DocNodeView, anchorOf, type DocTreeNode } from '../../components/DocNodeView';
import { DocTree } from '../../components/DocTree';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';

interface DocSummary { id: string; source: string; path: string; title: string; nodes: number; requirements: number; sourceUrl: string | null; gitSha: string | null; indexedAt: string }
interface Hit { uid: string; document: string; docId: string; type: string; title: string; snippet: string; match: 'uid' | 'prefix' | 'text' }

/** Onglet Documents : consultation en lecture seule des documents StrictDoc indexés, par section, avec recherche par UID ou texte. */
export function DocumentsTab() {
  const { project, doc } = useParams();
  const location = useLocation();
  const fail = useFailure();
  const t = fr.docs;
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [tree, setTree] = useState<{ document: DocSummary; nodes: DocTreeNode[]; truncated: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const selected = decodeURIComponent(location.hash.replace(/^#/, '')) || null;

  useEffect(() => { api<DocSummary[]>('GET', `/v1/projects/${project}/docs`).then(setDocs).catch(fail); }, [project, fail]);
  useEffect(() => {
    setTree(null);
    if (!doc) return;
    api<{ document: DocSummary; nodes: DocTreeNode[]; truncated: boolean }>('GET', `/v1/projects/${project}/docs/${doc}/tree`).then(setTree).catch(fail);
  }, [project, doc, fail]);
  // Adresse stable par exigence : l'ancre `#UID` fait défiler jusqu'au nœud une fois le document chargé.
  useEffect(() => {
    if (!tree || !selected) return;
    document.getElementById(selected)?.scrollIntoView?.({ block: 'start' });
  }, [tree, selected]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!q.trim()) { setHits(null); return; }
    try { setHits(await api<Hit[]>('GET', `/v1/projects/${project}/docs/search?q=${encodeURIComponent(q.trim())}`)); } catch (error) { fail(error); }
  };

  const current = tree?.document ?? docs?.find((d) => d.id === doc);
  return (
    <>
      <PageHeader title={t.title} />
      {docs === null ? <p role="status">{fr.loading}</p> : docs.length === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
        <div className="ath-doc">
          <div className="ath-stack ath-doc__side">
            <nav aria-label={t.list}>
              <ul className="ath-stack">
                {docs.map((d) => (
                  <li key={d.id}><Link className="ath-link" to={`/p/${project}/documents/${d.id}`} aria-current={d.id === doc ? 'page' : undefined}>{d.title}</Link> <span className="ath-eyebrow ath-mono">{d.source}</span></li>
                ))}
              </ul>
            </nav>
            <form className="ath-stack" role="search" aria-label={t.search} onSubmit={(e) => void search(e)}>
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="doc-q">{t.searchLabel}</label>
                <input id="doc-q" className="ath-input ath-mono" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} maxLength={200} />
              </div>
              <Btn type="submit" icon="search">{t.searchRun}</Btn>
            </form>
            {hits !== null && (
              hits.length === 0 ? <p role="status">{t.noHit}</p> : (
                <ul className="ath-stack" aria-label={t.results(hits.length)}>
                  {hits.map((h) => (
                    <li key={`${h.docId}:${h.uid}`}>
                      <Link className="ath-link ath-mono" to={`/p/${project}/documents/${h.docId}#${encodeURIComponent(h.uid)}`}>{h.uid}</Link> {h.title}
                      <div className="ath-eyebrow">{h.document} · {t.matches[h.match]}</div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
          <div className="ath-stack ath-doc__main">
            {!doc ? <p>{t.choose}</p> : !tree ? <p role="status">{fr.loading}</p> : (
              <>
                <h2 className="ath-section-title">{tree.document.title}</h2>
                <p className="ath-doc__banner" role="note">
                  {t.readOnly}{' '}
                  {current?.sourceUrl ? <a className="ath-link" href={current.sourceUrl} target="_blank" rel="noopener noreferrer">{t.openSource}</a> : <span className="ath-mono">{current?.source}/{current?.path}</span>}
                  {current?.gitSha && <> · <span className="ath-mono">{current.gitSha.slice(0, 8)}</span></>}
                </p>
                {tree.truncated && <Tag variant="accent">{t.truncated}</Tag>}
                <DocTree project={String(project)} doc={tree.document.id} nodes={tree.nodes} selected={selected} />
                <div className="ath-doc__content">
                  {tree.nodes.map((n) => <DocNodeView key={anchorOf(n)} node={n} project={String(project)} source={tree.document.source} selected={selected === anchorOf(n)} />)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { Btn, EmptyState, Table, Tag, Td, Th } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { formatDateTime } from '../lib/dates';

interface Baseline { name: string; gitTag: string; gitSha: string; docShas: Record<string, string | null>; createdBy: string; createdAt: string }
interface DocDiff { source: string; from: string | null; to: string | null; added: Array<{ uid: string; title: string }>; modified: Array<{ uid: string; title: string }>; removed: Array<{ uid: string; title: string }> }
export interface BaselineDiff { created: string[]; modified: string[]; deleted: string[]; trackers: string[]; docs: DocDiff[] }

const short = (sha: string | null) => (sha ? sha.slice(0, 8) : '—');

/**
 * Baselines du projet et comparaison de deux d'entre elles : items et trackers, puis exigences documentaires ajoutées, modifiées,
 * supprimées par source avec le SHA du document à chaque baseline. La comparaison s'exporte en CSV (mention de protection posée par l'API).
 */
export function BaselineCompare({ project }: { project: string }) {
  const t = fr.baselineCompare;
  const fail = useFailure();
  const [items, setItems] = useState<Baseline[] | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [diff, setDiff] = useState<BaselineDiff | null>(null);

  useEffect(() => {
    api<Baseline[]>('GET', `/v1/projects/${project}/baselines`).then((list) => {
      setItems(list);
      if (list.length >= 2) { setTo(list[0]!.name); setFrom(list[1]!.name); }
    }).catch(() => setItems([]));
  }, [project]);

  const compare = async () => {
    try { setDiff(await api<BaselineDiff>('GET', `/v1/projects/${project}/baselines-diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)); } catch (error) { fail(error); }
  };
  const exportCsv = async () => {
    try {
      const out = await api<{ filename: string; csv: string }>('GET', `/v1/projects/${project}/baselines-diff/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const href = URL.createObjectURL(new Blob([out.csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = href; a.download = out.filename; a.click();
      URL.revokeObjectURL(href);
    } catch (error) { fail(error); }
  };

  if (items === null) return <p role="status">{fr.loading}</p>;
  if (items.length === 0) return <EmptyState eyebrow={t.title} title={t.empty} />;
  const total = diff ? diff.created.length + diff.modified.length + diff.deleted.length + diff.trackers.length + diff.docs.reduce((n, d) => n + d.added.length + d.modified.length + d.removed.length + (d.from !== d.to ? 1 : 0), 0) : 0;
  return (
    <section className="ath-stack" aria-labelledby="baselines-title">
      <h2 id="baselines-title" className="ath-section-title">{t.title}</h2>
      <Table>
        <caption className="ath-table__caption">{t.title} · {project}</caption>
        <thead><tr><Th>{t.name}</Th><Th>{t.commit}</Th><Th>{t.documents}</Th><Th>{t.date}</Th></tr></thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.name}>
              <Td mono>{b.name}</Td><Td mono>{short(b.gitSha)}</Td>
              <Td>{Object.keys(b.docShas).length === 0 ? '—' : Object.entries(b.docShas).map(([s, sha]) => <div key={s}><span className="ath-mono">{s}</span> <span className="ath-mono">{short(sha)}</span></div>)}</Td>
              <Td mono>{formatDateTime(b.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {items.length < 2 ? <p>{t.needTwo}</p> : (
        <div className="ath-toolbar">
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="bc-from">{t.from}</label>
            <select id="bc-from" className="ath-select" value={from} onChange={(e) => setFrom(e.target.value)}>{items.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select>
          </div>
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="bc-to">{t.to}</label>
            <select id="bc-to" className="ath-select" value={to} onChange={(e) => setTo(e.target.value)}>{items.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}</select>
          </div>
          <Btn disabled={!from || !to || from === to} onClick={() => void compare()}>{t.compare}</Btn>
          <Btn variant="ghost" disabled={!diff} onClick={() => void exportCsv()}>{t.exportCsv}</Btn>
        </div>
      )}
      {diff && (
        <div className="ath-stack" aria-live="polite">
          <p>{total === 0 ? t.noChange : t.summary(from, to, total)}</p>
          {(diff.created.length + diff.modified.length + diff.deleted.length + diff.trackers.length) > 0 && (
            <ul className="ath-stack" aria-label={t.items}>
              {diff.created.length > 0 && <li>{t.created}: <span className="ath-mono">{diff.created.join(', ')}</span></li>}
              {diff.modified.length > 0 && <li>{t.modified}: <span className="ath-mono">{diff.modified.join(', ')}</span></li>}
              {diff.deleted.length > 0 && <li>{t.deleted}: <span className="ath-mono">{diff.deleted.join(', ')}</span></li>}
              {diff.trackers.length > 0 && <li>{t.trackers}: <span className="ath-mono">{diff.trackers.join(', ')}</span></li>}
            </ul>
          )}
          {diff.docs.map((d) => (
            <section key={d.source} className="ath-card ath-stack" aria-label={t.docOf(d.source)}>
              <h3 className="ath-subsection-title"><span className="ath-mono">{d.source}</span> {d.from !== d.to && <Tag variant="accent">{t.shaChanged(short(d.from), short(d.to))}</Tag>}</h3>
              {([['added', d.added], ['modified', d.modified], ['removed', d.removed]] as const).map(([kind, list]) => list.length > 0 && (
                <div key={kind}>
                  <span className="ath-eyebrow">{t.requirements[kind]} ({list.length})</span>
                  <ul>{list.map((n) => <li key={n.uid}><span className="ath-mono">{n.uid}</span> {n.title}</li>)}</ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

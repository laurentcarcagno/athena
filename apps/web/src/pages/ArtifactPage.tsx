import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Id, PageHeader, StatusPill, Table, Tabs, Td, Th, Tag, useToast } from '@athena/ui';
import { ApiError, api, type Artifact, type Field, type Revision, type Session, type TrackerDefinition } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { pillKind } from './ListPage';

interface LinkView { id: string; type: string; direction: string; label: string; other: string; suspect: boolean }
interface Comment { id: string; author: string; body: string; createdAt: string }
interface CodeRef { kind: string; ref: string; title: string; state: string; pipeline: string }
interface DocLink { uid: string; title: string; status: string; suspect: boolean; orphan: boolean }

const asText = (value: unknown): string => (value === undefined || value === null ? '' : Array.isArray(value) ? value.join(', ') : String(value));

/** Convertit la saisie en valeur typée ; `null` retire la valeur. */
export function parseValue(field: Field, raw: string): unknown {
  if (raw.trim() === '') return null;
  if (field.type === 'number') return Number(raw);
  if (field.type === 'multiselect') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return raw;
}

function FieldEditor({ field, value, onCommit }: { field: Field; value: unknown; onCommit: (raw: string) => void }) {
  const [draft, setDraft] = useState(asText(value));
  useEffect(() => setDraft(asText(value)), [value]);
  const label = field.required ? `${field.label} (${fr.artifact.required})` : field.label;
  const commit = () => { if (draft !== asText(value)) onCommit(draft); };
  if (field.type === 'select') {
    const options = (field.config['options'] as string[] | undefined) ?? [];
    return (
      <div className="ath-field">
        <label className="ath-field__label" htmlFor={`f-${field.key}`}>{label}</label>
        <select id={`f-${field.key}`} className="ath-select" value={draft} onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }}>
          {!field.required && <option value="" />}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (field.type === 'richtext') {
    return (
      <div className="ath-field">
        <label className="ath-field__label" htmlFor={`f-${field.key}`}>{label}</label>
        <textarea id={`f-${field.key}`} className="ath-input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      </div>
    );
  }
  return (
    <div className="ath-field">
      <label className="ath-field__label" htmlFor={`f-${field.key}`}>{label}</label>
      <input id={`f-${field.key}`} className={field.type === 'number' || field.type === 'date' ? 'ath-input ath-mono' : 'ath-input'} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
    </div>
  );
}

export function ArtifactPage({ session }: { session: Session }) {
  const { project, key } = useParams();
  const toast = useToast();
  const fail = useFailure();
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [tab, setTab] = useState('details');
  const [links, setLinks] = useState<LinkView[]>([]);
  const [docs, setDocs] = useState<DocLink[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<Revision[]>([]);
  const [code, setCode] = useState<CodeRef[]>([]);
  const [comment, setComment] = useState('');
  const base = `/v1/projects/${project}/artifacts/${key}`;

  const reload = useCallback(async () => {
    const a = await api<Artifact>('GET', base);
    setArtifact(a);
    setDef(await api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${a.trackerKey}`));
    const [l, d, c, h, r] = await Promise.all([
      api<LinkView[]>('GET', `${base}/links`), api<DocLink[]>('GET', `${base}/doc-links`), api<Comment[]>('GET', `${base}/comments`),
      api<Revision[]>('GET', `${base}/history`), api<CodeRef[]>('GET', `${base}/code-refs`),
    ]);
    setLinks(l); setDocs(d); setComments(c); setHistory(h); setCode(r);
  }, [base, project]);
  useEffect(() => { reload().catch(fail); }, [reload, fail]);

  if (!artifact || !def) return <p role="status">{fr.loading}</p>;
  const status = def.statuses.find((s) => s.key === artifact.status);
  const available = def.transitions.filter((t) => t.fromStatusId === null || t.fromStatusId === status?.id).filter((t) => t.toStatusId !== status?.id);
  const title = String(artifact.values['title'] ?? artifact.values['name'] ?? '');

  const save = async (field: Field, raw: string) => {
    try {
      const updated = await api<Artifact>('PATCH', base, { values: { [field.key]: parseValue(field, raw) }, version: artifact.version });
      setArtifact(updated);
      setHistory(await api<Revision[]>('GET', `${base}/history`));
      toast('success', fr.artifact.saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await reload();
      fail(error);
    }
  };
  const transition = async (name: string) => {
    try {
      const updated = await api<Artifact>('POST', `${base}/transitions`, { name, version: artifact.version });
      setArtifact({ ...artifact, status: updated.status, version: updated.version });
      setHistory(await api<Revision[]>('GET', `${base}/history`));
      toast('success', fr.artifact.transitioned(name));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await reload();
      fail(error);
    }
  };
  const restore = async (target: number) => {
    try {
      const restored = await api<Artifact>('POST', `${base}/restore`, { version: target, expectedVersion: artifact.version });
      setArtifact(restored);
      setHistory(await api<Revision[]>('GET', `${base}/history`));
      toast('success', fr.artifact.restored(target));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await reload();
      fail(error);
    }
  };
  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `${base}/comments`, { body: comment });
      setComment('');
      setComments(await api<Comment[]>('GET', `${base}/comments`));
    } catch (error) { fail(error); }
  };

  return (
    <>
      <PageHeader
        eyebrow={def.name}
        title={`${artifact.key} · ${title}`}
        sub={<><StatusPill kind={pillKind(status?.category ?? '')}>{status?.name ?? artifact.status}</StatusPill> <Link className="ath-link" to={`/p/${project}`}>{project}</Link></>}
        actions={<div className="ath-row" aria-label={fr.artifact.transitions}>{available.map((t) => <Btn key={t.id} variant="deep" onClick={() => transition(t.name)}>{t.name}</Btn>)}</div>}
      />
      <Tabs
        tabs={[
          { id: 'details', label: fr.artifact.details }, { id: 'links', label: fr.artifact.links }, { id: 'history', label: fr.artifact.history },
          { id: 'activity', label: fr.artifact.activity }, { id: 'dev', label: fr.artifact.development },
        ]}
        active={tab} onChange={setTab}
      />
      <div className="ath-stack" role="tabpanel">
        {tab === 'details' && (
          <Card title={fr.artifact.details} meta={`v${artifact.version}`}>
            <div className="ath-grid-2">
              {def.fields.map((f) => <FieldEditor key={f.key} field={f} value={artifact.values[f.key]} onCommit={(raw) => save(f, raw)} />)}
            </div>
          </Card>
        )}
        {tab === 'links' && (links.length + docs.length === 0 ? <EmptyState eyebrow={fr.artifact.links} title={fr.artifact.noLinks} /> : (
          <Card title={fr.artifact.links}>
            <div className="ath-stack">
              {links.map((l) => (
                <div key={l.id} className="ath-row">
                  <span>{l.label}</span> <Link className="ath-link ath-mono" to={`/p/${project}/a/${l.other}`}>{l.other}</Link>
                  {l.suspect && <StatusPill kind="warning">{fr.artifact.suspect}</StatusPill>}
                </div>
              ))}
              {docs.length > 0 && <span className="ath-eyebrow">{fr.artifact.docs}</span>}
              {docs.map((d) => (
                <div key={d.uid} className="ath-row">
                  <Id>{d.uid}</Id> <span>{d.title}</span>
                  {d.suspect && <StatusPill kind="warning">{fr.artifact.suspect}</StatusPill>}
                  {d.orphan && <StatusPill kind="danger">{fr.artifact.absent}</StatusPill>}
                </div>
              ))}
            </div>
          </Card>
        ))}
        {tab === 'history' && (history.length === 0 ? <EmptyState eyebrow={fr.artifact.history} title={fr.artifact.noHistory} /> : (
          <Table>
            <thead><tr><Th>{fr.artifact.version}</Th><Th>{fr.artifact.author}</Th><Th>{fr.artifact.date}</Th><Th>{fr.artifact.changes}</Th><Th>{fr.artifact.commit}</Th><Th>{fr.artifact.restore}</Th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.version}>
                  <Td mono>{r.version}</Td>
                  <Td>{r.actor}</Td>
                  <Td mono mute>{r.at.slice(0, 16).replace('T', ' ')}</Td>
                  <Td>{Object.entries(r.diff).map(([field, d]) => (
                    <div key={field}><Id>{field}</Id> <span className="ath-diff__from">{asText(d.from) || '∅'}</span> → <span className="ath-diff__to">{asText(d.to) || '∅'}</span></div>
                  ))}</Td>
                  <Td mono>{r.gitSha ? r.gitSha.slice(0, 8) : '—'}</Td>
                  <Td>{r.version < artifact.version && <Btn size="sm" variant="ghost" onClick={() => restore(r.version)}>{fr.artifact.restore}</Btn>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
        {tab === 'activity' && (
          <Card title={fr.artifact.activity}>
            <div className="ath-stack">
              {comments.length === 0 && <p>{fr.artifact.noComments}</p>}
              {comments.map((c) => (
                <div key={c.id}><span className="ath-eyebrow">{c.author} · <span className="ath-mono">{c.createdAt.slice(0, 16).replace('T', ' ')}</span></span><p>{c.body}</p></div>
              ))}
              <form className="ath-stack" onSubmit={addComment}>
                <label className="ath-field__label" htmlFor="comment">{fr.artifact.comment}</label>
                <textarea id="comment" className="ath-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
                <div><Btn type="submit" disabled={comment.trim() === ''}>{fr.artifact.addComment}</Btn></div>
              </form>
            </div>
          </Card>
        )}
        {tab === 'dev' && (code.length === 0 ? <EmptyState eyebrow={fr.artifact.development} title={fr.artifact.noCode} /> : (
          <Table>
            <thead><tr><Th>{fr.artifact.type}</Th><Th>{fr.artifact.reference}</Th><Th>{fr.artifact.titleCol}</Th><Th>{fr.artifact.state}</Th><Th>{fr.artifact.pipeline}</Th></tr></thead>
            <tbody>
              {code.map((r) => (
                <tr key={`${r.kind}-${r.ref}`}>
                  <Td><Tag>{r.kind}</Tag></Td><Td mono>{r.ref.length > 12 ? r.ref.slice(0, 8) : r.ref}</Td><Td>{r.title}</Td>
                  <Td>{r.state}</Td>
                  <Td>{r.pipeline && <StatusPill kind={r.pipeline === 'success' ? 'success' : r.pipeline === 'failed' ? 'danger' : 'info'}>{r.pipeline}</StatusPill>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
        <span hidden>{session.user?.username}</span>
      </div>
    </>
  );
}

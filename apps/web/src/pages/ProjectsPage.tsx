import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Btn, EmptyState, Id, PageHeader, Table, Tag, Td, Th } from '@athena/ui';
import { api, type Session, type TrackerDefinition } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface TrackerRow { key: string; name: string; artifacts: number; attributes: string[] }
interface ProjectEntry { key: string; name: string; trackers: TrackerRow[]; boards: Array<{ key: string; name: string }> }

export function ProjectsPage({ session }: { session?: Session } = {}) {
  const navigate = useNavigate();
  const admin = session?.user?.roles.includes('athena-admin') ?? false;
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const fail = useFailure();
  useEffect(() => {
    (async () => {
      const list = await api<Array<{ key: string; name: string }>>('GET', '/v1/projects');
      const entries = await Promise.all(list.map(async (p) => {
        const trackers = await api<Array<{ key: string; name: string; artifacts: number }>>('GET', `/v1/projects/${p.key}/trackers`);
        const rows = await Promise.all(trackers.map(async (t) => {
          const definition = await api<TrackerDefinition>('GET', `/v1/projects/${p.key}/trackers/${t.key}`).catch(() => null);
          return { key: t.key, name: t.name, artifacts: t.artifacts, attributes: (definition?.fields ?? []).map((f) => f.label) };
        }));
        return { ...p, trackers: rows, boards: await api<ProjectEntry['boards']>('GET', `/v1/projects/${p.key}/boards`) };
      }));
      setProjects(entries);
      if (entries.length === 1) setOpen(new Set([entries[0]!.key])); // un seul projet : rien à masquer (critère « 3 actions »)
    })().catch(fail);
  }, [fail]);

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return (
    <>
      <PageHeader eyebrow={fr.projects.eyebrow} title={fr.projects.title}
        actions={admin ? <Btn size="sm" onClick={() => navigate('/org')}>{fr.projects.newProject}</Btn> : undefined} />
      {projects === null ? <p role="status">{fr.loading}</p> : projects.length === 0 ? (
        <EmptyState eyebrow={fr.projects.emptyEyebrow} title={fr.projects.empty} />
      ) : (
        <Table>
          <thead><tr><Th><span className="ath-visually-hidden">{fr.projects.expandColumn}</span></Th><Th>{fr.projects.project}</Th><Th>{fr.projects.trackers}</Th><Th>{fr.projects.boards}</Th></tr></thead>
          <tbody>
            {projects.flatMap((p) => {
              const expanded = open.has(p.key);
              const rows = [(
                <tr key={p.key}>
                  <Td>
                    <button type="button" className="ath-iconbtn" aria-expanded={expanded} aria-label={`${expanded ? fr.projects.collapse : fr.projects.expand} ${p.name}`} title={`${expanded ? fr.projects.collapse : fr.projects.expand} ${p.name}`} onClick={() => toggle(p.key)}>{expanded ? '▾' : '▸'}</button>
                  </Td>
                  <Td><Link className="ath-link" to={`/p/${p.key}`}>{p.name}</Link> <Id>{p.key}</Id></Td>
                  <Td mono>{p.trackers.length}</Td>
                  <Td>{p.boards.length === 0 ? '' : p.boards.map((b) => <Link key={b.key} className="ath-link" to={`/p/${p.key}/board/${b.key}`}>{b.name} </Link>)}</Td>
                </tr>
              )];
              if (expanded) {
                rows.push(
                  <tr key={`${p.key}-trackers`}>
                    <Td />
                    <Td colSpan={3}>
                      {p.trackers.length === 0 ? <p>{fr.projects.noTracker}</p> : (
                        <Table>
                          <thead><tr><Th>{fr.projects.trackerName}</Th><Th>{fr.projects.artifacts}</Th><Th>{fr.projects.attributes}</Th></tr></thead>
                          <tbody>
                            {p.trackers.map((t) => (
                              <tr key={t.key}>
                                <Td><Link className="ath-link" to={`/p/${p.key}/t/${t.key}/tableau`}>{t.name}</Link></Td>
                                <Td mono>{t.artifacts}</Td>
                                <Td>
                                  {t.attributes.length === 0 ? fr.projects.noAttribute : (
                                    <ul className="ath-taglist" aria-label={`${fr.projects.attributes} ${t.name}`}>
                                      {t.attributes.map((a) => <li key={a}><Tag>{a}</Tag></li>)}
                                    </ul>
                                  )}
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                      {admin && <Btn size="sm" variant="ghost" onClick={() => navigate(`/p/${p.key}/trackers/new`)}>{fr.builder.addTracker}</Btn>}
                    </Td>
                  </tr>,
                );
              }
              return rows;
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

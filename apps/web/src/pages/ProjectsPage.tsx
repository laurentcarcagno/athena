import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Id, PageHeader, Table, Tag, Td, Th } from '@athena/ui';
import { api, type TrackerDefinition } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface TrackerRow { key: string; name: string; artifacts: number; attributes: string[] }
interface ProjectEntry { key: string; name: string; trackers: TrackerRow[]; boards: Array<{ key: string; name: string }> }

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
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
    })().catch(fail);
  }, [fail]);

  return (
    <>
      <PageHeader eyebrow={fr.projects.eyebrow} title={fr.projects.title} />
      {projects === null ? <p role="status">{fr.loading}</p> : projects.length === 0 ? (
        <EmptyState eyebrow={fr.projects.emptyEyebrow} title={fr.projects.empty} />
      ) : (
        <div className="ath-stack">
          {projects.map((p) => (
            <Card key={p.key} title={p.name} meta={p.key}>
              <div className="ath-stack">
                {p.trackers.length === 0 ? <p>{fr.projects.noTracker}</p> : (
                  <Table>
                    <thead><tr><Th>{fr.projects.trackerName}</Th><Th>{fr.projects.artifacts}</Th><Th>{fr.projects.attributes}</Th></tr></thead>
                    <tbody>
                      {p.trackers.map((t) => (
                        <tr key={t.key}>
                          <Td>
                            <Link className="ath-link" to={`/p/${p.key}?q=${encodeURIComponent(`tracker = ${t.key}`)}`}><Tag variant="solid">{t.key}</Tag> {t.name}</Link>
                          </Td>
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
                {p.boards.length > 0 && (
                  <div className="ath-row">
                    <span className="ath-eyebrow">{fr.projects.boards}</span>
                    {p.boards.map((b) => <Link key={b.key} className="ath-link" to={`/p/${p.key}/board/${b.key}`}>{b.name}</Link>)}
                  </div>
                )}
                <Link className="ath-link" to={`/p/${p.key}`}><Id>{p.key}</Id> · {fr.nav.search}</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

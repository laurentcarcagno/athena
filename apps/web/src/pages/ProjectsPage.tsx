import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Id, PageHeader, Tag } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface ProjectEntry { key: string; name: string; trackers: Array<{ key: string; name: string; artifacts: number }>; boards: Array<{ key: string; name: string }> }

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const fail = useFailure();
  useEffect(() => {
    (async () => {
      const list = await api<Array<{ key: string; name: string }>>('GET', '/v1/projects');
      const entries = await Promise.all(list.map(async (p) => ({
        ...p,
        trackers: await api<ProjectEntry['trackers']>('GET', `/v1/projects/${p.key}/trackers`),
        boards: await api<ProjectEntry['boards']>('GET', `/v1/projects/${p.key}/boards`),
      })));
      setProjects(entries);
    })().catch(fail);
  }, [fail]);

  return (
    <>
      <PageHeader eyebrow={fr.projects.eyebrow} title={fr.projects.title} />
      {projects === null ? <p role="status">{fr.loading}</p> : projects.length === 0 ? (
        <EmptyState eyebrow={fr.projects.emptyEyebrow} title={fr.projects.empty} />
      ) : (
        <div className="ath-grid-2">
          {projects.map((p) => (
            <Card key={p.key} title={p.name} meta={p.key}>
              <div className="ath-stack">
                <div className="ath-row">
                  <span className="ath-eyebrow">{fr.projects.trackers}</span>
                  {p.trackers.map((t) => (
                    <Link key={t.key} className="ath-link" to={`/p/${p.key}?q=${encodeURIComponent(`tracker = ${t.key}`)}`}>
                      <Tag variant="solid">{t.key}</Tag> <span className="ath-mono">{t.artifacts}</span>
                    </Link>
                  ))}
                </div>
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

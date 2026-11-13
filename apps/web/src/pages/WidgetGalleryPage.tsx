import { DashCard, DashGrid } from '@athena/ui';
import { fr } from '../i18n';
import { BadgesCard, GeneralInfoCard, GlobalProgressCard, HealthCard, KeyIndicatorsCard, PipelinesCard, QualityCard, SprintProgressCard, WidgetData, WidgetEmpty, type Kpis, type Pipelines, type Quality } from '../components/WidgetCards';

/**
 * Galerie de test des widgets (ADR-0007, T-0177) : chaque genre dans les quatre états d'un projet (sain, à surveiller, critique,
 * vide), avec des données fixes. Sert aux références visuelles (un thème et un mode à la fois, par le sélecteur du profil) ;
 * aucune requête n'est faite.
 */
const base: Kpis = {
  project: { key: 'LUMEN', name: 'Lumen', createdAt: '2026-01-05T10:00:00Z', members: 6, managers: ['pm.dev'] },
  progress: { total: 20, done: 12, inProgress: 3, todo: 5, percent: 60 },
  late: 0, blocked: 0, dueSoon: 2, open: 8,
  workload: [{ assignee: 'alice', count: 4 }, { assignee: 'bob', count: 3 }],
  velocity: { average: 21, forecast: 22, sprints: 3 },
  sprint: { id: 's1', name: 'Sprint 4', endsOn: '2026-11-20', items: 10, doneItems: 7, totalPoints: 20, donePoints: 14, percent: 70, daysLeft: 7 },
  health: { state: 'ok', reasons: [] },
};
const STATES: Array<{ id: string; label: string; kpis: Kpis; runs: Pipelines; quality: Quality }> = [
  { id: 'sain', label: 'Projet sain', kpis: base,
    runs: { configured: true, successRate: 100, running: false, repos: [{ repo: 'root/lumen', successRate: 100, running: false, last: 'success', runs: [{ id: 3, state: 'success', ref: 'main', url: '#' }, { id: 2, state: 'success', ref: 'main', url: '#' }] }] },
    quality: { connected: true, provider: 'sonar', measures: { gate: 'passed', coverage: 86, bugs: 0, vulnerabilities: 0, smells: 9, debtMinutes: 40, analyzedAt: null } } },
  { id: 'surveiller', label: 'Projet à surveiller', kpis: { ...base, late: 2, blocked: 1, open: 10, health: { state: 'attention', reasons: ['blocked', 'late'] }, progress: { total: 20, done: 8, inProgress: 4, todo: 8, percent: 40 } },
    runs: { configured: true, successRate: 67, running: true, repos: [{ repo: 'root/lumen', successRate: 67, running: true, last: 'running', runs: [{ id: 5, state: 'running', ref: 'main', url: '#' }, { id: 4, state: 'failed', ref: 'dev', url: '#' }, { id: 3, state: 'success', ref: 'main', url: '#' }] }] },
    quality: { connected: true, provider: 'sonar', measures: { gate: 'failed', coverage: 62, bugs: 5, vulnerabilities: 1, smells: 40, debtMinutes: 300, analyzedAt: null } } },
  { id: 'critique', label: 'Projet critique', kpis: { ...base, late: 6, blocked: 4, open: 12, health: { state: 'critical', reasons: ['blocked', 'late'] }, progress: { total: 20, done: 3, inProgress: 2, todo: 15, percent: 15 }, sprint: { ...base.sprint!, percent: 15, doneItems: 1, donePoints: 3, daysLeft: -2 } },
    runs: { configured: true, successRate: 20, running: false, repos: [{ repo: 'root/lumen', successRate: 20, running: false, last: 'failed', runs: [{ id: 9, state: 'failed', ref: 'main', url: '#' }, { id: 8, state: 'failed', ref: 'main', url: '#' }, { id: 7, state: 'success', ref: 'main', url: '#' }] }] },
    quality: { connected: true, provider: 'sonar', measures: { gate: 'failed', coverage: 31, bugs: 18, vulnerabilities: 6, smells: 120, debtMinutes: 1200, analyzedAt: null } } },
  { id: 'vide', label: 'Projet vide', kpis: { ...base, progress: { total: 0, done: 0, inProgress: 0, todo: 0, percent: 0 }, open: 0, dueSoon: 0, workload: [], velocity: { average: 0, forecast: 0, sprints: 0 }, sprint: null },
    runs: { configured: true, successRate: null, running: false, repos: [] },
    quality: { connected: false, provider: null, measures: null } },
];

export function WidgetGalleryPage() {
  return (
    <div className="ath-stack">
      <h1 className="ath-title">Galerie des widgets</h1>
      {STATES.map((st) => (
        <section key={st.id} aria-label={st.label} className="ath-stack">
          <h2 className="ath-section-title">{st.label}</h2>
          <WidgetData value={{ '/kpis': st.kpis, '/pipelines': st.runs, '/quality': st.quality, '/roadmap': st.id === 'vide' ? [] : [{ name: 'v1.0', state: 'published' }] }}>
            <DashGrid>
              {[
                [fr.home.kinds['general-info']!, <GeneralInfoCard key="a" project="LUMEN" />],
                [fr.home.kinds['global-progress']!, <GlobalProgressCard key="b" project="LUMEN" />],
                [fr.home.kinds['key-indicators']!, <KeyIndicatorsCard key="c" project="LUMEN" />],
                [fr.home.kinds['health']!, <HealthCard key="d" project="LUMEN" />],
                [fr.home.kinds['sprint-progress']!, <SprintProgressCard key="e" project="LUMEN" />],
                [fr.home.kinds['pipelines']!, <PipelinesCard key="f" project="LUMEN" />],
                [fr.home.kinds['quality']!, <QualityCard key="g" project="LUMEN" />],
                [fr.home.kinds['badges']!, <BadgesCard key="h" project="LUMEN" />],
                ['Liste vide', <WidgetEmpty key="i" text={fr.widgets.empty['search']!} action={fr.widgets.openSearch} to="/recherche" />],
              ].map(([title, body]) => (
                <DashCard key={String(title)} size="S" title={title as string} role="group" aria-label={`${st.label} : ${String(title)}`}>{body}</DashCard>
              ))}
            </DashGrid>
          </WidgetData>
        </section>
      ))}
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Btn, Id, PageHeader, StatusPill } from '@athena/ui';
import type { Artifact, Session, TrackerDefinition } from '../api';
import { fr } from '../i18n';
import { fromHere, originOf } from '../lib/origin';
import { pillKind } from '../pages/ListPage';
import { PinToggle } from './PinToggle';
import { SubscribeToggle } from './SubscribeToggle';
import { statusPill } from '../lib/status';

/** Transitions proposées depuis le statut courant, filtrées par les conditions de rôle. */
export function availableTransitions(def: TrackerDefinition, artifact: Artifact, session: Session) {
  const status = def.statuses.find((s) => s.key === artifact.status);
  return def.transitions.filter((t) => t.fromStatusId === null || t.fromStatusId === status?.id).filter((t) => t.toStatusId !== status?.id)
    .filter((t) => (t.conditions ?? []).every((c) => c.type !== 'role' || c.roles?.some((r) => session.user?.roles.includes(r))));
}

/** Lien vu depuis la fiche (`GET .../links`). */
export interface ItemLink { id: string; type: string; direction: string; label: string; other: string | null; restricted?: boolean; suspect: boolean; hierarchical?: boolean; propagatesSuspect?: boolean }
export interface ItemSprint { id: string; name: string; state: string }

const None = () => <><span aria-hidden="true">{fr.facts.none}</span><span className="ath-visually-hidden">{fr.facts.noneLabel}</span></>;

function Keys({ project, from, keys }: { project: string; from: string; keys: Array<string | null> }) {
  const location = useLocation();
  if (keys.length === 0) return <None />;
  return <>{keys.map((k, i) => <span key={k ?? `r${i}`}>{i > 0 && ', '}{k === null ? fr.marking.restrictedLink : <Link className="ath-link ath-mono" to={`/p/${project}/a/${k}`} state={fromHere(location, from)}>{k}</Link>}</span>)}</>;
}

/**
 * Navigation de la fiche depuis son origine (T-0113) : « Retour » vers la liste ou le ticket d'où l'on vient, puis, depuis
 * une liste, précédent et suivant avec la position (boutons, ou J / K hors saisie). L'onglet courant est conservé.
 */
export function ItemNav({ project, itemKey }: { project: string; itemKey: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = originOf(location);
  const keys = origin?.keys ?? [];
  const index = keys.indexOf(itemKey);
  const tab = new URLSearchParams(location.search).get('onglet');
  const go = (step: number) => {
    const key = keys[index + step];
    if (index < 0 || !key || !origin) return;
    navigate(`/p/${project}/a/${key}${tab ? `?onglet=${encodeURIComponent(tab)}` : ''}`, { state: { from: origin } });
  };
  const latest = useRef(go);
  latest.current = go;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const step = event.key === 'j' || event.key === 'J' ? 1 : event.key === 'k' || event.key === 'K' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      latest.current(step);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!origin) return null;
  return (
    <nav className="ath-row"aria-label={fr.origin.nav}>
      <Link className="ath-link" to={origin.href} state={origin.from ? { from: origin.from } : null}>{fr.origin.back(origin.label)}</Link>
      {index >= 0 && (
        <div className="ath-row" role="group" aria-label={fr.origin.position}>
          <Btn size="sm" variant="ghost" icon="previous" disabled={index === 0} onClick={() => go(-1)}>{fr.origin.previous}</Btn>
          <Id>{index + 1} / {keys.length}</Id>
          <Btn size="sm" variant="ghost" icon="next" disabled={index === keys.length - 1} onClick={() => go(1)}>{fr.origin.next}</Btn>
        </div>
      )}
    </nav>
  );
}

/**
 * Informations clés du ticket : responsable, priorité, échéance, version, sprint, parent, blocage. Priorité et version sont
 * les champs des rôles `priority` et `version` (le libellé du champ remplace le libellé générique). Une information absente,
 * ou sans champ dans le tracker, vaut « — » : la grille reste la même d'un ticket à l'autre.
 */
export function ItemFacts({ project, def, artifact, links, sprint, compact = false }: {
  project: string; def: TrackerDefinition; artifact: Artifact; links: ItemLink[]; sprint: ItemSprint | null; compact?: boolean;
}) {
  const byRole = (role: string) => def.fields.find((f) => f.semanticRole === role);
  const value = (role: string, mono = false) => {
    const field = byRole(role);
    const raw = field ? artifact.values[field.key] : undefined;
    const text = raw === undefined || raw === null || raw === '' ? '' : Array.isArray(raw) ? raw.join(', ') : String(raw);
    return text === '' ? <None /> : <span className={mono ? 'ath-mono' : undefined}>{text}</span>;
  };
  const label = (role: string, fallback: string) => byRole(role)?.label ?? fallback;
  const parents = links.filter((l) => l.hierarchical && l.direction === 'outward').map((l) => l.other);
  const blockers = links.filter((l) => l.type === 'blocks' && l.direction === 'inward').map((l) => l.other);
  const facts: Array<[string, ReactNode]> = [
    [label('assignee', fr.facts.assignee), value('assignee', true)],
    [label('priority', fr.facts.priority), value('priority')],
    [label('due_date', fr.facts.due), value('due_date', true)],
    [label('version', fr.facts.version), value('version', true)],
    [fr.facts.sprint, sprint ? sprint.name : <None />],
    [fr.facts.parent, <Keys project={project} from={artifact.key} keys={parents} />],
    [fr.facts.blockedBy, <Keys project={project} from={artifact.key} keys={blockers} />],
  ];
  return (
    <dl className={compact ? 'ath-facts ath-facts--compact' : 'ath-facts'} aria-label={fr.facts.label}>
      {facts.map(([term, detail]) => <div key={term} className="ath-facts__item"><dt>{term}</dt><dd>{detail}</dd></div>)}
    </dl>
  );
}

/**
 * En-tête de la fiche : clé, titre, statut, transitions, abonnement. Dans le panneau de l'écran Tracker (`embedded`), il
 * porte aussi « Agrandir » et « Fermer » ; sur la page, l'épingle et le lien vers le projet.
 */
export function ItemHeader({ session, project, def, artifact, links, sprint, embedded, onTransition, onExpand, onClose }: {
  session: Session; project: string; def: TrackerDefinition; artifact: Artifact; links: ItemLink[]; sprint: ItemSprint | null; embedded: boolean;
  onTransition: (name: string) => void; onExpand?: (() => void) | undefined; onClose?: (() => void) | undefined;
}) {
  const facts = <ItemFacts project={project} def={def} artifact={artifact} links={links} sprint={sprint} compact={embedded} />
  const status = def.statuses.find((s) => s.key === artifact.status);
  const available = availableTransitions(def, artifact, session);
  const title = String(artifact.values['title'] ?? artifact.values['name'] ?? '');
  const pill = <StatusPill {...statusPill(status?.category ?? '', status?.color)}>{status?.name ?? artifact.status}</StatusPill>;
  const transitions = (size: 'sm' | 'md') => (
    <div className="ath-row" role="group" aria-label={fr.artifact.transitions}>
      {available.map((t) => <Btn key={t.id} {...(size === 'sm' ? { size } : {})} variant="deep" onClick={() => onTransition(t.name)}>{t.name}</Btn>)}
    </div>
  );

  if (embedded) {
    return (
      <header className="ath-detail__head">
        <div className="ath-row">
          <h2 className="ath-section-title ath-detail__title"><span className="ath-mono ath-nowrap">{artifact.key}</span> · {title}</h2>
        </div>
        <div className="ath-row">
          {pill}
          {transitions('sm')}
          <SubscribeToggle project={project} scope="item" target={artifact.key} />
          <Btn size="sm" variant="ghost" onClick={onExpand}>{fr.detail.expand}</Btn>
          <Btn size="sm" variant="ghost" icon="close" onClick={onClose}>{fr.detail.close}</Btn>
        </div>
        {facts}
      </header>
    );
  }
  return (
    <>
    <PageHeader
      eyebrow={def.name}
      title={<><span className="ath-mono ath-nowrap">{artifact.key}</span> · {title}</>}
      sub={<>{pill} <Link className="ath-link" to={`/p/${project}`}>{project}</Link></>}
      actions={<>{transitions('md')}<SubscribeToggle project={project} scope="item" target={artifact.key} size="md" /><PinToggle entry={{ kind: 'item', project: String(project), ref: artifact.key, label: artifact.key }} /></>}
    />
    {/* Sous l'en-tête collant, qui recouvrirait sinon la navigation une fois la page défilée. */}
    <ItemNav project={project} itemKey={artifact.key} />
    {facts}
    </>
  );
}

import { Link } from 'react-router-dom';
import { Btn, PageHeader, StatusPill } from '@athena/ui';
import type { Artifact, Session, TrackerDefinition } from '../api';
import { fr } from '../i18n';
import { pillKind } from '../pages/ListPage';
import { PinToggle } from './PinToggle';
import { SubscribeToggle } from './SubscribeToggle';

/** Transitions proposées depuis le statut courant, filtrées par les conditions de rôle. */
export function availableTransitions(def: TrackerDefinition, artifact: Artifact, session: Session) {
  const status = def.statuses.find((s) => s.key === artifact.status);
  return def.transitions.filter((t) => t.fromStatusId === null || t.fromStatusId === status?.id).filter((t) => t.toStatusId !== status?.id)
    .filter((t) => (t.conditions ?? []).every((c) => c.type !== 'role' || c.roles?.some((r) => session.user?.roles.includes(r))));
}

/**
 * En-tête de la fiche : clé, titre, statut, transitions, abonnement. Dans le panneau de l'écran Tracker (`embedded`), il
 * porte aussi « Agrandir » et « Fermer » ; sur la page, l'épingle et le lien vers le projet.
 */
export function ItemHeader({ session, project, def, artifact, embedded, onTransition, onExpand, onClose }: {
  session: Session; project: string; def: TrackerDefinition; artifact: Artifact; embedded: boolean;
  onTransition: (name: string) => void; onExpand?: (() => void) | undefined; onClose?: (() => void) | undefined;
}) {
  const status = def.statuses.find((s) => s.key === artifact.status);
  const available = availableTransitions(def, artifact, session);
  const title = String(artifact.values['title'] ?? artifact.values['name'] ?? '');
  const pill = <StatusPill kind={pillKind(status?.category ?? '')}>{status?.name ?? artifact.status}</StatusPill>;
  const transitions = (size: 'sm' | 'md') => (
    <div className="ath-row" role="group" aria-label={fr.artifact.transitions}>
      {available.map((t) => <Btn key={t.id} {...(size === 'sm' ? { size } : {})} variant="deep" onClick={() => onTransition(t.name)}>{t.name}</Btn>)}
    </div>
  );

  if (embedded) {
    return (
      <header className="ath-detail__head">
        <div className="ath-row">
          <h2 className="ath-detail__title"><span className="ath-mono ath-nowrap">{artifact.key}</span> · {title}</h2>
        </div>
        <div className="ath-row">
          {pill}
          {transitions('sm')}
          <SubscribeToggle project={project} scope="item" target={artifact.key} />
          <Btn size="sm" variant="ghost" onClick={onExpand}>{fr.detail.expand}</Btn>
          <Btn size="sm" variant="ghost" icon="close" onClick={onClose}>{fr.detail.close}</Btn>
        </div>
      </header>
    );
  }
  return (
    <PageHeader
      eyebrow={def.name}
      title={<><span className="ath-mono ath-nowrap">{artifact.key}</span> · {title}</>}
      sub={<>{pill} <Link className="ath-link" to={`/p/${project}`}>{project}</Link></>}
      actions={<>{transitions('md')}<SubscribeToggle project={project} scope="item" target={artifact.key} size="md" /><PinToggle entry={{ kind: 'item', project: String(project), ref: artifact.key, label: artifact.key }} /></>}
    />
  );
}

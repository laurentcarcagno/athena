import { AccessLists } from '../../components/AccessLists';
import { ExportControlMembers } from '../../components/MarkingEditor';
import { ActorsTab } from '../ProjectManagePage';
import { fr } from '../../i18n';

/**
 * Paramètres › Membres (T-0120) : acteurs du projet et leurs rôles. Les réglages d'accès restreint (listes d'ayants droit) et
 * de contrôle export, rarement utiles, sont repliés sous une section « avancé » (ADR-0005, T-0151).
 */
export function MembersPanel({ project, me }: { project: string; me: string | undefined }) {
  return (
    <div className="ath-stack">
      <ActorsTab project={project} />
      <details className="ath-card ath-advanced">
        <summary className="ath-advanced__summary"><strong>{fr.manage.advancedTitle}</strong> <span className="ath-field__hint">{fr.manage.advancedHint}</span></summary>
        <div className="ath-stack ath-advanced__body"><AccessLists project={project} me={me} /><ExportControlMembers project={project} /></div>
      </details>
    </div>
  );
}

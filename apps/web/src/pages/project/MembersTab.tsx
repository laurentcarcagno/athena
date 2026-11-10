import { AccessLists } from '../../components/AccessLists';
import { ExportControlMembers } from '../../components/MarkingEditor';
import { ActorsTab } from '../ProjectManagePage';

/** Paramètres › Membres (T-0120) : acteurs du projet et leurs rôles, listes d'ayants droit, contrôle export. */
export function MembersPanel({ project, me }: { project: string; me: string | undefined }) {
  return <div className="ath-stack"><ActorsTab project={project} /><AccessLists project={project} me={me} /><ExportControlMembers project={project} /></div>;
}

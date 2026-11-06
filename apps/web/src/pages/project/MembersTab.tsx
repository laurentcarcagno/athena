import { useParams } from 'react-router-dom';
import { PageHeader } from '@athena/ui';
import type { Session } from '../../api';
import { fr } from '../../i18n';
import { ActorsTab } from '../ProjectManagePage';

/** Onglet Membres : acteurs du projet et leurs rôles (chefs de projet et administrateurs). */
export function MembersTab({ session }: { session: Session }) {
  const { project } = useParams();
  const roles = session.user?.roles ?? [];
  const header = <PageHeader eyebrow={fr.manage.eyebrow} title={`${fr.project.tabs.members} · ${project}`} />;
  if (!roles.includes('athena-admin') && !roles.includes('athena-pm')) return <>{header}<p className="ath-field__error">{fr.manage.restricted}</p></>;
  return <>{header}<ActorsTab project={String(project)} /></>;
}

import { PageHeader } from '@athena/ui';
import { type Session } from '../api';
import { fr } from '../i18n';
import { Dashboard } from '../components/Dashboard';

/** Fenêtre de l'utilisateur : son tableau de bord, qu'il organise lui-même en onglets. */
export function MyWorkPage({ session }: { session: Session }) {
  return (
    <>
      <PageHeader title={fr.work.title} />
      <div className="ath-stack">
        <Dashboard qa={(session.user?.roles ?? []).includes('athena-qa')} />
      </div>
    </>
  );
}

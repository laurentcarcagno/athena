import { Navigate } from 'react-router-dom';
import type { Session } from '../api';
import { usePreferences } from '../lib/preferences';
import { fr } from '../i18n';
import { MyWorkPage } from './MyWorkPage';

/** `/` : Mon travail, ou la liste des projets si la personne l'a choisie comme accueil dans son Profil (T-0123). */
export function HomeRoute({ session }: { session: Session }) {
  const { loaded, home } = usePreferences();
  if (!loaded) return <p role="status">{fr.loading}</p>;
  return home === 'projects' ? <Navigate replace to="/projets" /> : <MyWorkPage session={session} />;
}

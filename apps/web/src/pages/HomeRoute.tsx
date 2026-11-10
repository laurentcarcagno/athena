import { Navigate } from 'react-router-dom';
import type { Session } from '../api';
import { readHome } from '../lib/home';
import { MyWorkPage } from './MyWorkPage';

/** `/` : Mon travail, ou la liste des projets si la personne l'a choisie comme accueil dans son Profil (T-0123). */
export function HomeRoute({ session }: { session: Session }) {
  return readHome() === 'projects' ? <Navigate replace to="/projets" /> : <MyWorkPage session={session} />;
}

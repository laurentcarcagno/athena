/** Page d'accueil choisie dans le Profil (T-0123) : Mon travail (défaut) ou la liste des projets. Mémorisée par navigateur. */
export type HomeChoice = 'work' | 'projects';
export const HOME_KEY = 'athena.home';

export function readHome(): HomeChoice {
  try { return window.localStorage.getItem(HOME_KEY) === 'projects' ? 'projects' : 'work'; } catch { return 'work'; }
}

export function setHome(choice: HomeChoice): void {
  try {
    if (choice === 'work') window.localStorage.removeItem(HOME_KEY);
    else window.localStorage.setItem(HOME_KEY, choice);
  } catch { /* stockage indisponible : le réglage vaut pour la session seulement */ }
}

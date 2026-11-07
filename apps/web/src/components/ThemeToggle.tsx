import { fr } from '../i18n';
import { nextTheme, setTheme, useTheme, type ThemeChoice } from '../lib/theme';

const ICONS: Record<ThemeChoice, JSX.Element> = {
  // Système : un disque coupé en deux ; clair : un disque et ses rayons ; sombre : un croissant.
  system: <path d="M12 4a8 8 0 1 0 0 16V4z" />,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
};

/** Bascule clair, sombre, système (dans cet ordre) : l'état courant est dit en texte, le réglage est mémorisé par navigateur. */
export function ThemeToggle() {
  const choice = useTheme();
  const label = fr.theme.label(fr.theme.names[choice] ?? choice);
  return (
    <button type="button" className="ath-iconbtn" onClick={() => setTheme(nextTheme(choice))} aria-label={label} title={label} data-theme-choice={choice}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">{ICONS[choice]}</svg>
    </button>
  );
}

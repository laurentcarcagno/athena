import { useState } from 'react';
import { PageHeader } from '@athena/ui';
import type { Session } from '../api';
import { NotificationSettings } from '../components/NotificationSettings';
import { fr, getLocale, setLocale, type Locale } from '../i18n';
import { readHome, setHome, type HomeChoice } from '../lib/home';
import { setTheme, useTheme, type ThemeChoice, THEME_CHOICES } from '../lib/theme';

/**
 * Profil `/profil` (ADR-0003, T-0123) : les réglages de la personne en un seul endroit : langue, thème, notifications et page
 * d'accueil. Langue, thème et accueil sont mémorisés dans ce navigateur ; les notifications le sont sur le compte.
 */
export function ProfilePage({ session }: { session: Session }) {
  const theme = useTheme();
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [home, setHomeState] = useState<HomeChoice>(readHome());
  const p = fr.profile;
  return (
    <>
      <PageHeader eyebrow={p.eyebrow} title={p.title} />
      <div className="ath-stack">
        <p>{session.user?.name} <span className="ath-mono">{session.user?.username}</span></p>
        <fieldset className="ath-notify__settings">
          <legend>{p.display}</legend>
          <label className="ath-notify__pref">
            {p.language}
            <select className="ath-select" value={locale} onChange={(e) => { const next = e.target.value as Locale; setLocale(next); setLocaleState(next); }}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="ath-notify__pref">
            {p.theme}
            <select className="ath-select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}>
              {THEME_CHOICES.map((t) => <option key={t} value={t}>{fr.theme.names[t]}</option>)}
            </select>
          </label>
          <label className="ath-notify__pref">
            {p.home}
            <select className="ath-select" value={home} onChange={(e) => { const next = e.target.value as HomeChoice; setHome(next); setHomeState(next); }}>
              <option value="work">{fr.nav.work}</option>
              <option value="projects">{fr.nav.projects}</option>
            </select>
          </label>
        </fieldset>
        <h2 className="ath-label">{p.notifications}</h2>
        <NotificationSettings id="profile-notify" />
      </div>
    </>
  );
}

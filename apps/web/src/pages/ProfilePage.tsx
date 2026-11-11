import { useState } from 'react';
import { PageHeader, Select } from '@athena/ui';
import type { Session } from '../api';
import { NotificationSettings } from '../components/NotificationSettings';
import { fr, getLocale, setLocale, type Locale } from '../i18n';
import type { HomeChoice } from '../lib/home';
import { savePreference, usePreferences } from '../lib/preferences';
import { DENSITIES, setDensity, setTheme, useDensity, useTheme, type DensityChoice, type ThemeChoice, THEME_CHOICES } from '../lib/theme';
import { ThemePicker } from '../components/Appearance';

/**
 * Profil `/profil` (ADR-0003, T-0123) : les réglages de la personne en un seul endroit : langue, thème, notifications et page
 * d'accueil. Tout est enregistré sur le compte et suit la personne d'un navigateur à l'autre.
 */
export function ProfilePage({ session }: { session: Session }) {
  const theme = useTheme();
  const density = useDensity();
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const { home, setHomePreference } = usePreferences();
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
            <Select value={locale} onChange={(e) => { const next = e.target.value as Locale; setLocale(next); setLocaleState(next); savePreference({ locale: next }); }}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          </label>
          <label className="ath-notify__pref">
            {p.theme}
            <Select value={theme} onChange={(e) => { const next = e.target.value as ThemeChoice; setTheme(next); savePreference({ theme: next }); }}>
              {THEME_CHOICES.map((t) => <option key={t} value={t}>{fr.theme.names[t]}</option>)}
            </Select>
          </label>
          <ThemePicker />
          <label className="ath-notify__pref">
            {p.density}
            <Select value={density} onChange={(e) => { const next = e.target.value as DensityChoice; setDensity(next); savePreference({ density: next }); }}>
              {DENSITIES.map((d) => <option key={d} value={d}>{fr.density.names[d]}</option>)}
            </Select>
          </label>
          <label className="ath-notify__pref">
            {p.home}
            <Select value={home} onChange={(e) => setHomePreference(e.target.value as HomeChoice)}>
              <option value="work">{fr.nav.work}</option>
              <option value="projects">{fr.nav.projects}</option>
            </Select>
          </label>
        </fieldset>
        <h2 className="ath-section-title">{p.notifications}</h2>
        <NotificationSettings id="profile-notify" />
      </div>
    </>
  );
}

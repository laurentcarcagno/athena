import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Checkbox, Radio, Select, THEME_CATALOG, useToast, type ThemeEntry } from '@athena/ui';
import { api, upload } from '../api';
import { loadBrand, logoUrl, markUrl, useBrand } from '../lib/brand';
import { useConfirm } from './ConfirmDialog';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { savePreference } from '../lib/preferences';
import { allowedThemes, setAllowedThemes, setThemeFamily, useResolvedMode, useThemeFamily } from '../lib/theme';

export interface Appearance { defaultTheme: string; allowedThemes: string[] }

/**
 * Vignette d'un thème (T-0136) : rail, fond, carte, texte et accent du thème dans le mode courant. Dessinée en SVG avec des
 * attributs `fill` (aucun style en ligne : CSP), sans charger le CSS du thème. Décorative : le nom du thème est dit à côté.
 */
export function ThemePreview({ theme, mode }: { theme: ThemeEntry; mode: 'light' | 'dark' }) {
  const c = theme[mode];
  return (
    <svg className="ath-theme-preview" viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">
      <rect width="64" height="40" fill={c.app} />
      <rect width="14" height="40" fill={c.inverse} />
      <rect x="20" y="6" width="38" height="28" fill={c.surface} />
      <rect x="24" y="11" width="22" height="3" fill={c.text} />
      <rect x="24" y="18" width="30" height="2" fill={c.text} opacity="0.5" />
      <rect x="24" y="25" width="12" height="5" fill={c.accent} />
    </svg>
  );
}

/** Choix du thème dans le Profil : vignettes en groupe de boutons radio, limité aux thèmes proposés par l'organisation. */
export function ThemePicker() {
  const current = useThemeFamily();
  const mode = useResolvedMode();
  const choices = allowedThemes();
  const pick = (name: string) => { void setThemeFamily(name); savePreference({ family: name }); };
  return (
    <fieldset className="ath-theme-picker">
      <legend className="ath-field__label">{fr.appearance.theme}</legend>
      {choices.map((t) => (
        <label key={t.name} className="ath-theme-picker__choice">
          <Radio className="ath-visually-hidden" name="theme-family" value={t.name} checked={current === t.name} onChange={() => pick(t.name)} />
          <ThemePreview theme={t} mode={mode} />
          <span>{t.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Administration > Apparence : thème par défaut et thèmes proposés aux personnes de l'organisation. */
export function AppearanceTab() {
  const fail = useFailure();
  const toast = useToast();
  const [form, setForm] = useState<Appearance | null>(null);
  useEffect(() => { api<Appearance>('GET', '/v1/appearance').then(setForm).catch(fail); }, [fail]);
  if (!form) return <p role="status">{fr.loading}</p>;
  const all = form.allowedThemes.length === 0;
  const offered = (name: string) => all || form.allowedThemes.includes(name);
  const toggle = (name: string, on: boolean) => {
    const current = all ? THEME_CATALOG.map((t) => t.name) : form.allowedThemes;
    const next = on ? [...new Set([...current, name])] : current.filter((n) => n !== name);
    setForm({ ...form, allowedThemes: next.length === THEME_CATALOG.length ? [] : next });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saved = await api<Appearance>('PUT', '/v1/admin/appearance', form);
      setForm(saved);
      setAllowedThemes(saved.allowedThemes.length ? saved.allowedThemes : null, saved.defaultTheme);
      toast('success', fr.appearance.saved);
    } catch (error) { fail(error); }
  };
  return (
    <form className="ath-stack" onSubmit={submit} aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="ath-section-title">{fr.appearance.title}</h2>
      <p>{fr.appearance.help}</p>
      <label className="ath-field">
        <span className="ath-field__label">{fr.appearance.defaultTheme}</span>
        <Select value={form.defaultTheme} onChange={(e) => setForm({ ...form, defaultTheme: e.target.value })}>
          {THEME_CATALOG.filter((t) => offered(t.name)).map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
        </Select>
      </label>
      <fieldset className="ath-stack">
        <legend className="ath-field__label">{fr.appearance.offered}</legend>
        {THEME_CATALOG.map((t) => (
          <label key={t.name} className="ath-row">
            <Checkbox checked={offered(t.name)} disabled={t.name === form.defaultTheme} onChange={(e) => toggle(t.name, e.target.checked)} />
            <ThemePreview theme={t} mode="light" />
            <ThemePreview theme={t} mode="dark" />
            {t.label}
          </label>
        ))}
      </fieldset>
      <div><Btn type="submit">{fr.appearance.save}</Btn></div>
      <BrandSection kind="mark" />
      <BrandSection kind="logo" />
    </form>
  );
}

/** Icône de marque par thème ou pour tous les thèmes (T-0137) : aperçu, téléversement, retrait. */
function BrandSection({ kind }: { kind: 'mark' | 'logo' }) {
  const fail = useFailure();
  const toast = useToast();
  const entries = useBrand();
  const confirm = useConfirm();
  const scopes = [{ name: '*', label: fr.appearance.allThemes }, ...THEME_CATALOG.map((t) => ({ name: t.name, label: t.label }))];
  const send = async (scope: string, file: File | undefined) => {
    if (!file) return;
    try {
      await upload(`/v1/admin/brand/${encodeURIComponent(scope)}/${kind}`, file, 'PUT');
      await loadBrand();
      toast('success', fr.appearance.uploaded);
    } catch (error) { fail(error); }
  };
  const remove = async (scope: string, label: string) => {
    if (!(await confirm.ask({ title: kind === 'mark' ? fr.appearance.removeFor(label) : fr.appearance.removeLogoFor(label), body: fr.appearance.removeBody, confirm: fr.confirm.delete }))) return;
    try {
      await api('DELETE', `/v1/admin/brand/${encodeURIComponent(scope)}/${kind}`);
      await loadBrand();
      toast('success', fr.appearance.removed);
    } catch (error) { fail(error); }
  };
  return (
    <section className="ath-stack" aria-labelledby={`brand-${kind}`}>
      <h3 id={`brand-${kind}`} className="ath-subsection-title">{kind === 'mark' ? fr.appearance.brandTitle : fr.appearance.logoTitle}</h3>
      <p>{kind === 'mark' ? fr.appearance.brandHelp : fr.appearance.logoHelp}</p>
      <ul className="ath-stack ath-brand-list">
        {scopes.map((s) => {
          const entry = entries.find((e) => e.kind === kind && e.theme === s.name);
          const own = Boolean(entry);
          const src = s.name === '*' ? (entry ? `/v1/brand/*/${kind}?v=${encodeURIComponent(entry.updatedAt)}` : null) : kind === 'mark' ? markUrl(s.name) : logoUrl(s.name);
          return (
            <li key={s.name} className="ath-row">
              <span className="ath-brand-list__preview">{src ? <img className="ath-sidebar__mark" src={src} alt="" /> : null}</span>
              <span className="ath-brand-list__label">{s.label}{!own && s.name !== '*' && kind === 'mark' ? ` (${fr.appearance.themeDefault})` : ''}</span>
              <label className="ath-btn ath-btn--ghost ath-btn--sm">
                {kind === 'mark' ? fr.appearance.uploadFor(s.label) : fr.appearance.uploadLogoFor(s.label)}
                <input type="file" className="ath-visually-hidden" accept="image/png,image/webp,image/svg+xml" onChange={(e) => { void send(s.name, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {own && <Btn variant="danger" size="sm" onClick={() => void remove(s.name, s.label)}>{kind === 'mark' ? fr.appearance.removeFor(s.label) : fr.appearance.removeLogoFor(s.label)}</Btn>}
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </section>
  );
}

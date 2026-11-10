import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fr } from '../i18n';
import type { ProjectNav } from './Rail';

/** Sections du projet courant, fournies par la coquille (`App.tsx`) à partir du rail : une seule source. */
export const ProjectNavContext = createContext<ProjectNav | null>(null);

/** Ouvre la palette de commandes (écoutée par `CommandPalette`). */
export const PALETTE_EVENT = 'athena:open-palette';
export const openPalette = (): void => { window.dispatchEvent(new Event(PALETTE_EVENT)); };

/**
 * Sélecteur de section du projet, affiché sous 768 px seulement (le rail y est un tiroir) : un bouton qui déplie la liste
 * des sections sous forme de liens. Échap referme et rend le focus au bouton ; un changement de page referme.
 */
export function SectionPicker() {
  const nav = useContext(ProjectNavContext);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!nav || nav.entries.length === 0) return null;
  const here = nav.entries.find((e) => e.id === nav.current);
  return (
    <nav className="ath-section-picker" aria-label={fr.mobileNav.sections(nav.project)}>
      <button ref={toggle} type="button" className="ath-section-picker__toggle" aria-expanded={open} aria-controls="section-picker-list" onClick={() => setOpen(!open)}>
        <span><span className="ath-mono">{nav.project}</span> · {here?.label ?? fr.mobileNav.choose}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul id="section-picker-list" className="ath-section-picker__list">
          {nav.entries.map((e) => (
            <li key={e.id}><Link className="ath-section-picker__link" to={e.id} aria-current={e.id === nav.current ? 'page' : undefined}>{e.label}</Link></li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/**
 * Barre basse (sous 768 px) : les destinations globales à portée de pouce, la palette et le tiroir du rail.
 * Le bouton Menu garde la classe `ath-menu-btn` : la coquille lui rend le focus à la fermeture du tiroir.
 */
export function BottomBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="ath-bottombar" aria-label={fr.mobileNav.bar}>
      <Link className="ath-bottombar__item" to="/me" aria-current={pathname === '/me' ? 'page' : undefined}>{fr.nav.work}</Link>
      <Link className="ath-bottombar__item" to="/" aria-current={pathname === '/' ? 'page' : undefined}>{fr.nav.projects}</Link>
      <button type="button" className="ath-bottombar__item" onClick={openPalette}>{fr.mobileNav.find}</button>
      <button type="button" className="ath-bottombar__item ath-menu-btn" aria-expanded={menuOpen} aria-controls="rail" onClick={onMenu}>{fr.nav.menu}</button>
    </nav>
  );
}

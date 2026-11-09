import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

/** Identifiant (clé d'artefact, SHA, UID) : toujours en IBM Plex Mono, chiffres tabulaires. */
export function Id({ children }: { children: ReactNode }) {
  return <span className="ath-mono">{children}</span>;
}

/**
 * Écritures en cours dans l'application (le client d'API les déclare). Un bouton cliqué qui déclenche une écriture reste en état
 * « loading » (désactivé, aria-busy, « … ») jusqu'à la fin de toutes les écritures : un double envoi est impossible, sans que
 * chaque formulaire gère son propre état (audit F-08).
 */
export const writeActivity = (() => {
  let pending = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    begin(): void { pending++; notify(); },
    end(): void { pending = Math.max(0, pending - 1); notify(); },
    count: (): number => pending,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
})();

const ICON_PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.5-4.5',
  plus: 'M12 5v14M5 12h14',
  previous: 'm15 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M10 7V4h4v3m-8 0 1 13h10l1-13',
  save: 'M5 4h12l2 2v14H5zM8 4v5h7V4M8 20v-6h8v6',
  reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
} as const;
export type BtnIcon = keyof typeof ICON_PATHS;
/** Bouton : avec `icon`, il n'affiche que le pictogramme ; le libellé (children) devient l'info-bulle et le nom accessible. */
export function Btn({ variant = 'primary', size = 'md', className, loading = false, children, onClick, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'deep' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: BtnIcon }) {
  // État « loading » de la charte : contrôle désactivé, aria-busy, libellé suivi de « … ».
  const [writing, setWriting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const watch = () => {
    // Après le clic (et l'envoi du formulaire, qui suit le clic) : une écriture a-t-elle démarré ? Alors le bouton attend sa fin.
    setTimeout(() => {
      if (!mounted.current || writeActivity.count() === 0) return;
      setWriting(true);
      const off = writeActivity.subscribe(() => {
        if (writeActivity.count() > 0) return;
        off();
        if (mounted.current) setWriting(false);
      });
    }, 0);
  };
  const busy = loading || writing;
  return (
    <button type="button" {...rest} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented || rest.type === 'submit') watch(); }}
      disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cx('ath-btn', `ath-btn--${variant}`, size !== 'md' && `ath-btn--${size}`, icon && 'ath-btn--icon', className)}
      {...(icon && typeof children === 'string' ? { title: rest.title ?? rest['aria-label'] ?? children, 'aria-label': rest['aria-label'] ?? children } : {})}>
      {icon ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[icon]} /></svg> : children}{busy ? '…' : null}
    </button>
  );
}

export type PillKind = 'success' | 'warning' | 'danger' | 'info' | 'default';
export function StatusPill({ kind = 'default', children }: { kind?: PillKind; children: ReactNode }) {
  return (
    <span className={cx('ath-pill', kind !== 'default' && `ath-pill--${kind}`)}>
      <span className="ath-pill__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Tag({ variant = 'default', children }: { variant?: 'default' | 'solid' | 'accent' | 'ghost'; children: ReactNode }) {
  return <span className={cx('ath-tag', variant !== 'default' && `ath-tag--${variant}`)}>{children}</span>;
}

export function FilterChip({ label, value, active = false, onClick, onClear }: { label: string; value: string; active?: boolean; onClick?: () => void; onClear?: () => void }) {
  return (
    <span className={cx('ath-chip', active && 'ath-chip--active')} onClick={onClick} role="group" aria-label={`${label} : ${value}`}>
      <span className="ath-chip__label">{label}</span>
      <span>{value}</span>
      {active && onClear && (
        <button type="button" className="ath-icon-btn ath-icon-btn--bare" aria-label={`Retirer le filtre ${label}`} onClick={(e) => { e.stopPropagation(); onClear(); }}>×</button>
      )}
    </span>
  );
}

/** Champ de recherche : le raccourci ⌘K / Ctrl+K est toujours présent dans la chrome (Hemeria). */
export function SearchInput({ placeholder = 'Rechercher…', onSearch, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onSearch?: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <div className="ath-search" role="search">
      <span aria-hidden="true">⌕</span>
      <input ref={ref} className="ath-search__input" type="search" placeholder={placeholder} aria-label={placeholder} onChange={(e) => onSearch?.(e.target.value)} {...rest} />
      <span className="ath-search__hint" aria-hidden="true">⌘K</span>
    </div>
  );
}

/** Champ de formulaire : l'étiquette est toujours visible ; le placeholder ne la remplace jamais. */
export function Field({ label, error, mono = false, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; mono?: boolean }) {
  const id = useId();
  return (
    <div className="ath-field">
      <label className="ath-field__label" htmlFor={id}>{label}</label>
      <input id={id} className={cx('ath-input', error && 'ath-input--error', mono && 'ath-mono')} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
      {error && <span id={`${id}-error`} className="ath-field__error" role="alert">{error}</span>}
    </div>
  );
}

const CardContext = createContext(false);
/** Carte. Les cartes imbriquées sont interdites par la charte : elles lèvent une erreur. */
export function Card({ title, meta, children }: { title?: string; meta?: ReactNode; children: ReactNode }) {
  if (useContext(CardContext)) throw new Error('Card imbriquée : interdit par la charte Hemeria');
  return (
    <CardContext.Provider value={true}>
      <section className="ath-card">
        {(title || meta) && (
          <header className="ath-card__header">
            <h3 className="ath-label ath-card__title">{title}</h3>
            {meta && <span className="ath-mono ath-card__meta">{meta}</span>}
          </header>
        )}
        <div className="ath-card__body">{children}</div>
      </section>
    </CardContext.Provider>
  );
}

export function StatCard({ label, value, delta, icon }: { label: string; value: ReactNode; delta?: string; icon?: ReactNode }) {
  return (
    <div className="ath-stat">
      <div className="ath-stat__row">
        <div>
          <div className="ath-stat__label">{label}</div>
          <div className="ath-stat__value">{value}</div>
          {delta && <div className="ath-stat__delta">{delta}</div>}
        </div>
        {icon && <div className="ath-stat__icon" aria-hidden="true">{icon}</div>}
      </div>
    </div>
  );
}

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return <div className="ath-table-wrap"><table className="ath-table">{caption && <caption className="ath-eyebrow ath-table__caption">{caption}</caption>}{children}</table></div>;
}

export type SortState = 'asc' | 'desc' | null;
const NEXT_SORT: Record<string, SortState> = { none: 'asc', asc: 'desc', desc: null };

/** En-tête triable : le clic parcourt null → asc → desc → null. */
export function Th({ children, sort, onSort }: { children: ReactNode; sort?: SortState; onSort?: (next: SortState) => void }) {
  const sortable = onSort !== undefined;
  const state = sort ?? null;
  const toggle = () => onSort?.(NEXT_SORT[state ?? 'none'] ?? null);
  return (
    <th
      scope="col"
      className={cx('ath-th', sortable && 'ath-th--sortable')}
      aria-sort={state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : sortable ? 'none' : undefined}
      onClick={sortable ? toggle : undefined}
      onKeyDown={sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
      tabIndex={sortable ? 0 : undefined}
    >
      {children}
      {sortable && <span className="ath-th__sort" aria-hidden="true">{state === 'asc' ? '▲' : state === 'desc' ? '▼' : '↕'}</span>}
    </th>
  );
}

export function Td({ children, mono = false, mute = false, center = false, colSpan }: { children?: ReactNode; mono?: boolean; mute?: boolean; center?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={cx('ath-td', mono && 'ath-mono', mute && 'ath-td--mute', center && 'ath-td--center')}>{children}</td>;
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ id: string; label: string }>; active: string; onChange: (id: string) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, delta: number) => {
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="ath-tabs" role="tablist">
      {tabs.map((tab, i) => (
        <button
          key={tab.id} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" className="ath-tab"
          aria-selected={tab.id === active} tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight') move(i, 1); else if (e.key === 'ArrowLeft') move(i, -1); }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Modale : focus piégé, Échap, clic sur le fond et bouton de fermeture ; le focus revient au déclencheur. */
export function Modal({ open, title, size = 'sm', onClose, children, footer }: { open: boolean; title: string; size?: 'sm' | 'md' | 'lg'; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // `onClose` est souvent une fonction recréée à chaque rendu : on la lit par référence pour que l'effet
  // (focus initial, piège de focus) ne se relance qu'à l'ouverture et ne vole pas le focus pendant la saisie.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="ath-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} className={cx('ath-modal', size !== 'sm' && `ath-modal--${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ath-modal__header">
          <h3 id={titleId} className="ath-modal__title">{title}</h3>
          <button type="button" className="ath-icon-btn" aria-label="Fermer" onClick={onClose}>×</button>
        </header>
        <div className="ath-modal__body">{children}</div>
        {footer && <footer className="ath-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export type ToastKind = 'success' | 'danger' | 'warning' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

function ToastView({ toast, onDismiss, duration }: { toast: ToastItem; onDismiss: () => void; duration: number }) {
  const [paused, setPaused] = useState(false);
  // Une erreur reste affichée jusqu'à sa fermeture ; les autres messages sont suspendus au survol et au focus.
  const persistent = toast.kind === 'danger';
  useEffect(() => {
    if (paused || persistent) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, persistent, onDismiss, duration]);
  return (
    <div className={`ath-toast ath-toast--${toast.kind}`} role={toast.kind === 'danger' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="ath-toast__message">{toast.message}</span>
      <button type="button" className="ath-icon-btn" aria-label="Fermer la notification" onClick={onDismiss}>×</button>
    </div>
  );
}

/** Notifications en haut à droite, fermeture auto à 5 s, pause au survol. Le texte reste sobre (pas de « ! »). */
export function ToastProvider({ children, duration = 5000 }: { children: ReactNode; duration?: number }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((kind: ToastKind, message: string) => {
    setToasts((list) => [...list, { id: next.current++, kind, message }]);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="ath-toasts" aria-live="polite">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} duration={duration} onDismiss={() => setToasts((list) => list.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function EmptyState({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="ath-empty">
      <div className="ath-empty__frame" aria-hidden="true">∅</div>
      <div className="ath-eyebrow">{eyebrow}</div>
      <h3 className="ath-empty__title">{title}</h3>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  // L'en-tête reste visible au défilement : sa hauteur est publiée pour décaler les en-têtes de tableau collants.
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = header.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const publish = () => document.documentElement.style.setProperty('--ath-pageheader-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--ath-pageheader-h'); };
  }, []);
  return (
    <header ref={header} className="ath-pageheader">
      <div className="ath-pageheader__left">
        <div className="ath-stripe" aria-hidden="true">
          <div className="ath-stripe__blue" /><div className="ath-stripe__white" /><div className="ath-stripe__red" />
        </div>
        <div>
          {eyebrow && <p className="ath-eyebrow ath-pageheader__eyebrow">{eyebrow}</p>}
          <h1 className="ath-pageheader__title">{title}</h1>
          {sub && <div className="ath-pageheader__sub">{sub}</div>}
        </div>
      </div>
      {actions && <div className="ath-pageheader__actions">{actions}</div>}
    </header>
  );
}

/** Réticule : à n'utiliser qu'une fois par page, sur la région la plus importante. */
export function CornerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="ath-corner">
      {['tl', 'tr', 'bl', 'br'].map((p) => <span key={p} className={`ath-corner__tick ath-corner__tick--${p}`} aria-hidden="true" />)}
      {children}
    </div>
  );
}

/** Icône de rôle (administrateur : bouclier, chef de projet : boussole, utilisateur : personne). */
export function RoleIcon({ kind }: { kind: 'admin' | 'manager' | 'user' }) {
  const path = kind === 'admin' ? 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z'
    : kind === 'manager' ? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 6.5-2 5-5 2 2-5z'
    : 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9c0-4 3.6-6 8-6s8 2 8 6z';
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}
export interface NavItem {
  id: string; label: string; href?: string;
  /** Niveau d'indentation dans une arborescence (0 par défaut). */
  depth?: number;
  /** Identifiant mono (clé de projet, de tracker, d'item) : rendu en IBM Plex Mono. */
  mono?: boolean;
  /** Contrôles propres à la ligne (monter / descendre un favori…), rendus après le libellé. */
  extra?: ReactNode;
}
/** Rubrique du rail : un titre facultatif et ses entrées. */
export interface NavSection {
  id: string; title?: string; items: NavItem[];
  /** Rubrique repliée : seul son titre (avec le nombre d'entrées) figure dans le rail, la liste s'ouvre dans un menu sur le côté. */
  flyout?: boolean;
  /** Texte du menu quand la rubrique est vide. */
  emptyLabel?: string;
}
/** Menu latéral d'une rubrique du rail (Favoris, Récents) : s'ouvre à droite du rail, se ferme sur Échap, sur un clic ailleurs ou après un choix. */
function NavFlyout({ group, current, onNavigate }: { group: NavSection; current: string; onNavigate: ((id: string) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  const label = `${group.title ?? ''} (${group.items.length})`;
  return (
    <div ref={root} className="ath-nav__section ath-flyout" role="group" aria-label={group.title}>
      <button type="button" className="ath-nav-item ath-flyout__toggle" aria-expanded={open}
        onClick={(e) => { setTop(e.currentTarget.getBoundingClientRect().top); setOpen(!open); }}>
        <span>{label}</span><span aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="ath-flyout__panel" role="group" aria-label={`${group.title ?? ''}, liste`} style={{ top }}>
          {group.items.length === 0 && <p className="ath-flyout__empty">{group.emptyLabel}</p>}
          {group.items.map((item) => (
            <div key={item.id} className="ath-flyout__row">
              <button type="button" className={cx('ath-flyout__item', item.mono && 'ath-mono')} aria-current={item.id === current ? 'page' : undefined} onClick={() => { setOpen(false); onNavigate?.(item.id); }}>{item.label}</button>
              {item.extra}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Sidebar({ id, items, sections, current, onNavigate, user, userActions, collapsed = false, open = false }: { id?: string; items?: NavItem[]; sections?: NavSection[]; current: string; onNavigate?: (id: string) => void; user?: { name: string; role: string; roleKind?: 'admin' | 'manager' | 'user' }; userActions?: ReactNode; collapsed?: boolean; open?: boolean }) {
  const groups: NavSection[] = sections ?? [{ id: 'main', items: items ?? [] }];
  const initials = user?.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '';
  return (
    <aside id={id} className={cx('ath-sidebar', collapsed && 'ath-sidebar--collapsed', open && 'ath-sidebar--open')}>
      <div className="ath-sidebar__brand">
        ATHENA
      </div>
      <nav className="ath-nav" aria-label="Navigation principale">
        {groups.map((group) => group.flyout ? <NavFlyout key={group.id} group={group} current={current} onNavigate={onNavigate} /> : (
          <div key={group.id} className="ath-nav__section" role="group" aria-label={group.title}>
            {group.title && <h2 className="ath-nav__title">{group.title}</h2>}
            {group.items.map((item) => (
              <div key={item.id} className="ath-nav__row">
                <button type="button" className={cx('ath-nav-item', item.mono && 'ath-mono')} data-depth={item.depth ?? 0} aria-current={item.id === current ? 'page' : undefined} onClick={() => onNavigate?.(item.id)}>
                  {item.label}
                </button>
                {item.extra}
              </div>
            ))}
          </div>
        ))}
      </nav>
      {user && (
        <div className="ath-sidebar__user">
          <div className="ath-avatar" role="img" aria-label={user.name} title={user.name}>{initials}</div>
          <span className="ath-sidebar__role" role="img" aria-label={user.role} title={user.role}><RoleIcon kind={user.roleKind ?? 'user'} /></span>
          {userActions && <div className="ath-sidebar__actions">{userActions}</div>}
        </div>
      )}
    </aside>
  );
}

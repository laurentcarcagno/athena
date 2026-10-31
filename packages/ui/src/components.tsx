import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

/** Identifiant (clé d'artefact, SHA, UID) : toujours en IBM Plex Mono, chiffres tabulaires. */
export function Id({ children }: { children: ReactNode }) {
  return <span className="ath-mono">{children}</span>;
}

export function Btn({ variant = 'primary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'deep' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return <button type="button" {...rest} className={cx('ath-btn', `ath-btn--${variant}`, size !== 'md' && `ath-btn--${size}`, className)} />;
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
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span>{value}</span>
      {active && onClear && (
        <button type="button" className="ath-icon-btn" style={{ width: 16, height: 16, border: 0 }} aria-label={`Retirer le filtre ${label}`} onClick={(e) => { e.stopPropagation(); onClear(); }}>×</button>
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
            <h3 className="ath-label ath-card__title" style={{ margin: 0 }}>{title}</h3>
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
  return <table className="ath-table">{caption && <caption className="ath-eyebrow" style={{ textAlign: 'left', paddingBottom: 6 }}>{caption}</caption>}{children}</table>;
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

export function Td({ children, mono = false, mute = false, center = false }: { children: ReactNode; mono?: boolean; mute?: boolean; center?: boolean }) {
  return <td className={cx('ath-td', mono && 'ath-mono', mute && 'ath-td--mute', center && 'ath-td--center')}>{children}</td>;
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
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
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
  }, [open, onClose]);
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
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, onDismiss, duration]);
  return (
    <div className={`ath-toast ath-toast--${toast.kind}`} role={toast.kind === 'danger' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
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

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ath-pageheader">
      <div className="ath-pageheader__left">
        <div className="ath-stripe" aria-hidden="true">
          <div className="ath-stripe__blue" /><div className="ath-stripe__white" /><div className="ath-stripe__red" />
        </div>
        <div>
          {eyebrow && <p className="ath-eyebrow" style={{ margin: '0 0 4px' }}>{eyebrow}</p>}
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

export interface NavItem { id: string; label: string; href?: string }
export function Sidebar({ items, current, onNavigate, user, collapsed = false }: { items: NavItem[]; current: string; onNavigate?: (id: string) => void; user?: { name: string; role: string }; collapsed?: boolean }) {
  const initials = user?.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '';
  return (
    <aside className={cx('ath-sidebar', collapsed && 'ath-sidebar--collapsed')}>
      <div className="ath-sidebar__brand">
        ATHENA<span className="ath-sidebar__dot">·</span>BOARD
        <span className="ath-sidebar__sub">Suivi de projet</span>
      </div>
      <nav className="ath-nav" aria-label="Navigation principale">
        {items.map((item) => (
          <button key={item.id} type="button" className="ath-nav-item" aria-current={item.id === current ? 'page' : undefined} onClick={() => onNavigate?.(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      {user && (
        <div className="ath-sidebar__user">
          <div className="ath-avatar" aria-hidden="true">{initials}</div>
          <div><div>{user.name}</div><div className="ath-eyebrow" style={{ color: 'inherit', opacity: 0.6 }}>{user.role}</div></div>
        </div>
      )}
    </aside>
  );
}

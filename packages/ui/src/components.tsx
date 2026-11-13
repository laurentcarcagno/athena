import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
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
  check: 'm5 12 5 5L20 7',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  // Engrenage (Lucide « settings ») : réglages d'un objet.
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
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

export type PillKind = 'success' | 'warning' | 'danger' | 'info' | 'merged' | 'draft' | 'default';
/** Teintes nommées des statuts (T-0138) : chaque thème en fournit le fond, le texte et la bordure. */
export const HUES = ['gray', 'slate', 'blue', 'sky', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple'] as const;
export type Hue = (typeof HUES)[number];
export const isHue = (value: unknown): value is Hue => typeof value === 'string' && (HUES as readonly string[]).includes(value);
/** Pastille de statut : la teinte choisie par l'administration l'emporte ; sans teinte, la couleur suit le sens (`kind`). */
export function StatusPill({ kind = 'default', hue, children }: { kind?: PillKind; hue?: Hue | null; children: ReactNode }) {
  return (
    <span className={cx('ath-pill', hue ? `ath-pill--hue-${hue}` : kind !== 'default' && `ath-pill--${kind}`)}>
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
        <button type="button" className="ath-iconbtn ath-iconbtn--bare" aria-label={`Retirer le filtre ${label}`} onClick={(e) => { e.stopPropagation(); onClear(); }}>×</button>
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
/** Cadenas d'un champ en lecture seule (décoratif : la raison est dite en texte). */
export function LockIcon() {
  return <svg className="ath-lock" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}

/**
 * Champ de formulaire. En lecture seule (`readOnly`), la valeur reste lisible et sélectionnable mais sans cadre, le libellé
 * porte un cadenas et la raison (`readOnlyReason`) est donnée en info-bulle et aux lecteurs d'écran (T-0133).
 */
export function Field({ label, error, mono = false, readOnlyReason, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; mono?: boolean; readOnlyReason?: string }) {
  const id = useId();
  const readOnly = Boolean(rest.readOnly);
  const reason = readOnly ? (readOnlyReason ?? 'Lecture seule') : undefined;
  const described = [error && `${id}-error`, reason && `${id}-ro`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ath-field', readOnly && 'ath-field--readonly')} title={reason}>
      <label className="ath-field__label" htmlFor={id}>{readOnly && <LockIcon />}{label}</label>
      <input id={id} className={cx('ath-input', error && 'ath-input--error', mono && 'ath-mono')} aria-invalid={error ? true : undefined} aria-describedby={described} {...rest} />
      {reason && <span id={`${id}-ro`} className="ath-visually-hidden">{reason}</span>}
      {error && <span id={`${id}-error`} className="ath-field__error" role="alert">{error}</span>}
    </div>
  );
}

/** Liste déroulante : même hauteur, focus et états que le champ texte. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, ...rest }, ref) {
  return <select ref={ref} className={cx('ath-select', invalid && 'ath-input--error', className)} aria-invalid={invalid ? true : rest['aria-invalid']} {...rest} />;
});

/** Zone de texte : mêmes bordures, focus et états que le champ texte ; hauteur libre. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={cx('ath-input', 'ath-textarea', invalid && 'ath-input--error', className)} aria-invalid={invalid ? true : rest['aria-invalid']} {...rest} />;
});

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;
/** Case à cocher de la charte (cible de 24 px, couleur d'action, focus visible). */
export const Checkbox = forwardRef<HTMLInputElement, ToggleProps>(function Checkbox({ className, ...rest }, ref) {
  return <input ref={ref} type="checkbox" className={cx('ath-checkbox', className)} {...rest} />;
});
/** Bouton radio de la charte. */
export const Radio = forwardRef<HTMLInputElement, ToggleProps>(function Radio({ className, ...rest }, ref) {
  return <input ref={ref} type="radio" className={cx('ath-radio', className)} {...rest} />;
});
/** Interrupteur (réglage pris en compte immédiatement) : case à cocher annoncée comme `switch`. */
export const Switch = forwardRef<HTMLInputElement, ToggleProps>(function Switch({ className, ...rest }, ref) {
  return <input ref={ref} type="checkbox" role="switch" className={cx('ath-switch', className)} {...rest} />;
});

const CardContext = createContext(false);
export type DashSize = 'S' | 'M' | 'L' | 'XL';
export const DASH_SIZES: readonly DashSize[] = ['S', 'M', 'L', 'XL'];
/** Position et taille sur la grille 2D (colonnes 0 à 11, lignes de 88 px). */
export interface DashBox { x: number; y: number; w: number; h: number }
/** Classes de position d'une carte (CSP : pas d'attribut style) : colonne, ligne, largeur et hauteur, à partir de 1. */
export const boxClasses = (b: DashBox): string[] => [`ath-gx-${b.x + 1}`, `ath-gy-${b.y + 1}`, `ath-gw-${b.w}`, `ath-gh-${b.h}`];

/**
 * Carte de tableau de bord (ADR-0005 § 2.3, T-0153) : modèle commun à Mon travail, Vue d'ensemble, Avancement et widgets
 * d'extension. En-tête (titre, précision, actions), une visualisation, pied (lien vers le détail, fraîcheur). Largeur sur la
 * grille de 12 colonnes (S = 4, M = 6, L = 8, XL = 12) et hauteur commune ; le surplus défile dans le corps.
 */
export function DashCard({ title, sub, actions, footer, size = 'M', box, handle, children, className, ...rest }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; footer?: ReactNode; size?: DashSize; box?: DashBox; handle?: ReactNode; children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <CardContext.Provider value={true}>
      <section className={cx('ath-dashcard', `ath-dashcard--${size}`, box && 'ath-dashcard--placed', box && boxClasses(box).join(' '), className)}
        {...rest}>
        <header className="ath-dashcard__head">
          {handle}
          <h3 className="ath-subsection-title ath-dashcard__title">{title}</h3>
          {sub && <span className="ath-dashcard__sub">{sub}</span>}
          {actions && <div className="ath-dashcard__actions">{actions}</div>}
        </header>
        <div className="ath-dashcard__body">{children}</div>
        {footer && <footer className="ath-dashcard__foot">{footer}</footer>}
      </section>
    </CardContext.Provider>
  );
}

/** Grille des cartes de tableau de bord : 12 colonnes, une ligne par rangée de cartes. */
export const DashGrid = forwardRef<HTMLDivElement, { children: ReactNode } & HTMLAttributes<HTMLDivElement>>(function DashGrid({ children, className, ...rest }, ref) {
  return <div ref={ref} className={cx('ath-dashgrid', className)} {...rest}>{children}</div>;
});

/** Carte. Les cartes imbriquées sont interdites par la charte : elles lèvent une erreur. */
/** Carte (fond et bordure) ou section (filet seul, `variant="section"`) ; jamais imbriquée. */
export function Card({ title, meta, children, variant = 'card' }: { title?: string; meta?: ReactNode; children: ReactNode; variant?: 'card' | 'section' }) {
  if (useContext(CardContext)) throw new Error('Card imbriquée : interdit par la charte Hemeria');
  return (
    <CardContext.Provider value={true}>
      <section className={cx('ath-card', variant === 'section' && 'ath-card--section')}>
        {(title || meta) && (
          <header className="ath-card__header">
            <h3 className="ath-subsection-title">{title}</h3>
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
          <h3 id={titleId} className="ath-subsection-title ath-modal__title">{title}</h3>
          <IconButton label="Fermer" tone="inverse" size="sm" onClick={onClose}>×</IconButton>
        </header>
        <div className="ath-modal__body">{children}</div>
        {footer && <footer className="ath-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export type ToastKind = 'success' | 'danger' | 'warning' | 'info';
/** Action proposée par un message (« Ouvrir SAT1-BUG-0042 ») : le message reste alors affiché jusqu'à sa fermeture (WCAG 2.2.1). */
export interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; kind: ToastKind; message: string; action?: ToastAction }
const ToastContext = createContext<(kind: ToastKind, message: string, action?: ToastAction) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

function ToastView({ toast, onDismiss, duration }: { toast: ToastItem; onDismiss: () => void; duration: number }) {
  const [paused, setPaused] = useState(false);
  // Une erreur reste affichée jusqu'à sa fermeture ; les autres messages sont suspendus au survol et au focus.
  const persistent = toast.kind === 'danger' || toast.action !== undefined;
  useEffect(() => {
    if (paused || persistent) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, persistent, onDismiss, duration]);
  return (
    <div className={`ath-toast ath-toast--${toast.kind}`} role={toast.kind === 'danger' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="ath-toast__message">{toast.message}</span>
      {toast.action && <button type="button" className="ath-toast__action" onClick={() => { toast.action!.onClick(); onDismiss(); }}>{toast.action.label}</button>}
      <button type="button" className="ath-iconbtn ath-iconbtn--sm" aria-label="Fermer la notification" title="Fermer la notification" onClick={onDismiss}>×</button>
    </div>
  );
}

/** Notifications en haut à droite, fermeture auto à 5 s, pause au survol. Le texte reste sobre (pas de « ! »). */
export function ToastProvider({ children, duration = 5000 }: { children: ReactNode; duration?: number }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    setToasts((list) => [...list, { id: next.current++, kind, message, ...(action ? { action } : {}) }]);
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
      <h3 className="ath-subsection-title ath-empty__title">{title}</h3>
      {action}
    </div>
  );
}

/**
 * Onglets qui changent d'adresse (sous-navigation d'une page : vues d'un tracker, rapports, paramètres). Même rendu que `Tabs` ;
 * l'onglet courant porte `aria-current="page"`. `link` rend le lien (par exemple un `Link` du routeur) avec les props données.
 */
export function TabLinks<T extends { id: string; label: ReactNode; current: boolean }>({ label, items, link }: {
  label: string; items: T[];
  link: (item: T, props: { className: string; 'aria-current': 'page' | undefined; children: ReactNode }) => ReactNode;
}) {
  return (
    <nav className="ath-tabs ath-tabs--links" aria-label={label}>
      {items.map((item) => <span key={item.id} className="ath-tabs__item">{link(item, { className: 'ath-tab', 'aria-current': item.current ? 'page' : undefined, children: item.label })}</span>)}
    </nav>
  );
}

/** Bouton-icône unique : sur surface claire (défaut) ou inverse (rail), taille normale (28 px) ou compacte (24 px). */
export function IconButton({ label, tone = 'surface', size = 'md', className, children, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string; tone?: 'surface' | 'inverse'; size?: 'md' | 'sm' | 'bare';
}) {
  return (
    <button type="button" aria-label={label} title={rest.title ?? label} {...rest}
      className={cx('ath-iconbtn', tone === 'inverse' && 'ath-iconbtn--inverse', size !== 'md' && `ath-iconbtn--${size}`, className)}>
      {children}
    </button>
  );
}

/**
 * Contexte de page fourni par la mise en page de l'application : une ligne au-dessus du titre (par exemple le projet courant)
 * et des actions ajoutées à celles de la page (par exemple épingler le projet). Les fournisseurs imbriqués se combinent.
 */
interface PageContextValue { context?: ReactNode; actions?: ReactNode }
const PageContext = createContext<PageContextValue>({});
export function PageContextProvider({ context, actions, children }: PageContextValue & { children: ReactNode }) {
  const parent = useContext(PageContext);
  const value = { context: context ?? parent.context, actions: actions === undefined ? parent.actions : <>{parent.actions}{actions}</> };
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  const page = useContext(PageContext);
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
          {page.context && <p className="ath-pageheader__context">{page.context}</p>}
          {eyebrow && <p className="ath-eyebrow ath-pageheader__eyebrow">{eyebrow}</p>}
          <h1 className="ath-pageheader__title">{title}</h1>
          {sub && <div className="ath-pageheader__sub">{sub}</div>}
        </div>
      </div>
      {(actions || page.actions) && <div className="ath-pageheader__actions">{actions}{page.actions}</div>}
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
  /** Icône (décorative) : seule visible quand le rail est replié, le libellé reste le nom accessible et l'info-bulle. */
  icon?: ReactNode;
  /** Niveau d'indentation dans une arborescence (0 par défaut). */
  depth?: number;
  /** Identifiant mono (clé de projet, de tracker, d'item) : rendu en IBM Plex Mono. */
  mono?: boolean;
  /** Contrôles propres à la ligne (monter / descendre un favori…), rendus après le libellé. */
  extra?: ReactNode;
  /** Titre en clair affiché après l'identifiant (nom du projet, du tracker, du ticket) ; l'identifiant reste en mono. */
  detail?: string;
  /** Entrée d'action mise en avant (première ligne d'un menu : « Nouveau projet »). */
  emphasis?: boolean;
  /** Ligne de groupe repliable : un bouton qui déplie ou replie les lignes qui suivent (il ne navigue pas). */
  toggle?: { expanded: boolean; onToggle: () => void };
}
/** Rubrique du rail : un titre facultatif et ses entrées. */
export interface NavSection {
  id: string; title?: string; items: NavItem[];
  /** Icône de la rubrique repliée en menu (Favoris, Récents). */
  icon?: ReactNode;
  /** Nombre affiché dans le titre d'une rubrique repliée, si différent du nombre d'entrées (une entrée d'action ne compte pas). */
  count?: number;
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
  const label = `${group.title ?? ''} (${group.count ?? group.items.length})`;
  return (
    <div ref={root} className="ath-nav__section ath-flyout" role="group" aria-label={group.title}>
      <button type="button" className="ath-nav-item ath-flyout__toggle" aria-expanded={open} title={label}
        onClick={(e) => { setTop(e.currentTarget.getBoundingClientRect().top); setOpen(!open); }}>
        {group.icon && <span className="ath-nav-item__icon" aria-hidden="true">{group.icon}</span>}<span className="ath-nav-item__label">{label}</span><span className="ath-flyout__chevron" aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="ath-flyout__panel" role="group" aria-label={`${group.title ?? ''}, liste`} style={{ top }}>
          {group.items.length === 0 && <p className="ath-flyout__empty">{group.emptyLabel}</p>}
          {group.items.map((item) => (
            <div key={item.id} className="ath-flyout__row">
              <button type="button" className={cx('ath-flyout__item', item.mono && !item.detail && 'ath-mono', item.emphasis && 'ath-flyout__action')} aria-current={item.id === current ? 'page' : undefined} title={item.detail ? `${item.label} · ${item.detail}` : item.label} onClick={() => { setOpen(false); onNavigate?.(item.id); }}>{item.detail ? <><span className={item.mono ? 'ath-mono' : undefined}>{item.label}</span> <span className="ath-flyout__detail">{item.detail}</span></> : item.label}</button>
              {item.extra}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Sidebar({ id, items, sections, current, onNavigate, user, userActions, collapsed = false, open = false, brand, userStatus, width, onResize, resizeLabel = 'Redimensionner le rail' }: { id?: string; items?: NavItem[]; sections?: NavSection[]; current: string; onNavigate?: (id: string) => void; user?: { name: string; role: string; roleKind?: 'admin' | 'manager' | 'user' }; userActions?: ReactNode; collapsed?: boolean; open?: boolean; brand?: ReactNode;
  /** À côté de l'icône de rôle (indicateur de notifications d'Athena). */
  userStatus?: ReactNode;
  /** Largeur courante en pixels et demande de nouvelle largeur : poignée de redimensionnement (glisser, ou flèches du clavier). */
  width?: number; onResize?: (px: number) => void; resizeLabel?: string }) {
  const groups: NavSection[] = sections ?? [{ id: 'main', items: items ?? [] }];
  const initials = user?.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '';
  return (
    <aside id={id} className={cx('ath-sidebar', collapsed && 'ath-sidebar--collapsed', open && 'ath-sidebar--open')}>
      {onResize && !collapsed && (
        <div className="ath-sidebar__resize" role="separator" aria-orientation="vertical" aria-label={resizeLabel} aria-valuenow={width} tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            const move = (m: PointerEvent) => onResize(m.clientX);
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            onResize((width ?? 232) + (e.key === 'ArrowRight' ? 16 : -16));
          }} />
      )}
      <div className="ath-sidebar__brand">
        {brand ?? 'ATHENA'}
      </div>
      <nav className="ath-nav" aria-label="Navigation principale">
        {groups.map((group) => group.flyout ? <NavFlyout key={group.id} group={group} current={current} onNavigate={onNavigate} /> : (
          <div key={group.id} className="ath-nav__section" role="group" aria-label={group.title}>
            {group.title && <h2 className="ath-nav__title">{group.title}</h2>}
            {group.items.map((item) => (
              <div key={item.id} className="ath-nav__row">
                <button type="button" className={cx('ath-nav-item', item.mono && 'ath-mono', item.icon !== undefined && 'ath-nav-item--icon', item.toggle && 'ath-nav-item--group')} data-depth={item.depth ?? 0} aria-current={item.id === current ? 'page' : undefined} aria-expanded={item.toggle ? item.toggle.expanded : undefined} title={item.label} onClick={() => (item.toggle ? item.toggle.onToggle() : onNavigate?.(item.id))}>
                  {item.icon && <span className="ath-nav-item__icon" aria-hidden="true">{item.icon}</span>}<span className="ath-nav-item__label">{item.label}</span>{item.toggle && <span className="ath-nav-item__chevron" aria-hidden="true">{item.toggle.expanded ? '▾' : '▸'}</span>}
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
          {userStatus}
          {userActions && <div className="ath-sidebar__actions">{userActions}</div>}
        </div>
      )}
    </aside>
  );
}

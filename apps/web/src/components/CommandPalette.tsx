import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Id, Modal } from '@athena/ui';
import { api, type SearchResult } from '../api';
import { fr } from '../i18n';
import { targetOf } from '../lib/create-target';
import { useCreate } from './CreateArtifact';
import { PALETTE_EVENT } from './MobileNav';

interface Entry { id: string; label: string; hint?: string; to?: string; run?: () => void }

/**
 * Palette de commandes (Ctrl/⌘K) : navigation, tickets de tous les projets autorisés (clé ou titre, T-0119) et actions
 * (« Créer un ticket… », recherche globale), entièrement au clavier. Une clé exacte arrive en tête : Ctrl+K, la clé, Entrée.
 */
export function CommandPalette({ project }: { project: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [hits, setHits] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const create = useCreate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen((v) => !v);
      }
    };
    const fromBar = () => setOpen(true); // bouton « Chercher » de la barre basse (mobile)
    document.addEventListener('keydown', handler, true);
    window.addEventListener(PALETTE_EVENT, fromBar);
    return () => { document.removeEventListener('keydown', handler, true); window.removeEventListener(PALETTE_EVENT, fromBar); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setIndex(0);
    // Le focus va au champ dès l'ouverture (après la mise en place du dialogue) : sur mobile, le clavier s'affiche.
    setTimeout(() => input.current?.focus(), 0);
    api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then(setProjects).catch(() => setProjects([]));
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) { setHits([]); return; }
    const q = query.trim().replace(/["\\]/g, '');
    const timer = setTimeout(() => {
      api<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(`key = "${q}" OR key ~ "${q}" OR title ~ "${q}"`)}&limit=8`)
        .then((r) => {
          // La clé exacte d'abord : Entrée ouvre le ticket.
          const exact = (h: { key: string }) => (h.key.toLowerCase() === q.toLowerCase() ? 0 : 1);
          setHits([...r.hits].sort((a, b) => exact(a) - exact(b)).map((h) => ({ id: h.key, label: h.key, hint: h.title && h.title !== h.key ? h.title : h.project, to: `/p/${h.project}/a/${h.key}` })));
        })
        .catch(() => setHits([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, open]);

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = [{ id: 'projects', label: fr.nav.projects, to: '/' }, { id: 'global-search', label: fr.palette.globalSearch, to: '/recherche' }];
    if (project) {
      nav.push(
        { id: 'overview', label: `${fr.nav.overview} · ${project}`, to: `/p/${project}` },
        { id: 'search', label: `${fr.nav.search} · ${project}`, to: `/p/${project}/recherche` },
        { id: 'settings', label: `${fr.settings.title} · ${project}`, to: `/p/${project}/parametres` },
      );
    }
    const q = query.trim().toLowerCase();
    const filtered = nav.filter((n) => q === '' || n.label.toLowerCase().includes(q));
    const projectEntries = projects.filter((p) => q === '' || p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).map((p) => ({ id: `p-${p.key}`, label: p.key, hint: p.name, to: `/p/${p.key}` }));
    const actions: Entry[] = [];
    if (q === '' || fr.palette.create.toLowerCase().includes(q)) actions.push({ id: 'create', label: fr.palette.create, run: () => create(targetOf(location.pathname)) });
    const typed = query.trim().replace(/["\\]/g, '');
    if (typed.length >= 2) actions.push({ id: 'search-all', label: fr.palette.searchAll(typed), to: `/recherche?q=${encodeURIComponent(`key ~ "${typed}" OR title ~ "${typed}"`)}` });
    // Tickets d'abord quand on tape : la clé cherchée est la première entrée.
    return [...hits, ...filtered, ...projectEntries, ...actions];
  }, [query, project, projects, hits, create, location.pathname]);

  useEffect(() => { setIndex((i) => Math.min(i, Math.max(entries.length - 1, 0))); }, [entries.length]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    if (entry.run) entry.run(); else if (entry.to) navigate(entry.to);
  };

  return (
    <Modal open={open} title={fr.palette.title} size="md" onClose={() => setOpen(false)}>
      <div className="ath-stack">
        <input
          ref={input} className="ath-input" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label={fr.palette.placeholder}
          placeholder={fr.palette.placeholder} value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(entries[index]); }
          }}
        />
        <ul id="palette-list" role="listbox" className="ath-palette">
          {entries.length === 0 && <li className="ath-eyebrow">{fr.palette.none}</li>}
          {entries.map((entry, i) => (
            <li key={entry.id} role="option" aria-selected={i === index} className={`ath-palette__item${i === index ? ' ath-palette__item--active' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => go(entry)}>
              <Id>{entry.label}</Id> {entry.hint && <span>{entry.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

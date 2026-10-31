import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Id, Modal } from '@athena/ui';
import { api, type SearchResult } from '../api';
import { fr } from '../i18n';

interface Entry { id: string; label: string; hint?: string; to: string }

/** Palette de commandes (Ctrl/⌘K) : navigation et recherche d'artefacts, entièrement au clavier. */
export function CommandPalette({ project }: { project: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [hits, setHits] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setIndex(0);
    api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then(setProjects).catch(() => setProjects([]));
  }, [open]);

  useEffect(() => {
    if (!open || !project || query.trim().length < 2) { setHits([]); return; }
    const q = query.trim().replace(/["\\]/g, '');
    const timer = setTimeout(() => {
      api<SearchResult>('GET', `/v1/projects/${project}/search?q=${encodeURIComponent(`key ~ "${q}" OR title ~ "${q}"`)}&limit=8`)
        .then((r) => setHits(r.hits.map((h) => ({ id: h.key, label: h.key, hint: String(h.values['title'] ?? ''), to: `/p/${project}/a/${h.key}` }))))
        .catch(() => setHits([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, open, project]);

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = [{ id: 'projects', label: fr.nav.projects, to: '/' }];
    if (project) {
      nav.push(
        { id: 'search', label: `${fr.nav.search} · ${project}`, to: `/p/${project}` },
        { id: 'dashboard', label: `${fr.nav.dashboard} · ${project}`, to: `/p/${project}/dashboard` },
        { id: 'admin', label: `${fr.nav.admin} · ${project}`, to: `/p/${project}/admin` },
      );
    }
    const q = query.trim().toLowerCase();
    const filtered = nav.filter((n) => q === '' || n.label.toLowerCase().includes(q));
    const projectEntries = projects.filter((p) => q === '' || p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).map((p) => ({ id: `p-${p.key}`, label: p.key, hint: p.name, to: `/p/${p.key}` }));
    return [...filtered, ...projectEntries, ...hits];
  }, [query, project, projects, hits]);

  useEffect(() => { setIndex((i) => Math.min(i, Math.max(entries.length - 1, 0))); }, [entries.length]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    navigate(entry.to);
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

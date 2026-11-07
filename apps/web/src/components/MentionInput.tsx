import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api } from '../api';
import { fr } from '../i18n';

interface Person { username: string; displayName: string }

/** Jeton `@début` juste avant le curseur (même règle que le serveur : pas dans une adresse de courriel ni un chemin). */
const OPEN_TOKEN = /(^|[^\w@./-])@([A-Za-z0-9._-]*)$/;
/** `@identifiant` d'un texte, pour l'affichage. */
const MENTION = /(^|[^\w@./-])(@[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?)/g;

/**
 * Texte d'un commentaire avec ses mentions mises en évidence. Aucun HTML n'est interprété : le texte reste du texte (React l'échappe),
 * seules les mentions reçoivent un habillage.
 */
export function MentionText({ body }: { body: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION)) {
    const start = m.index! + m[1]!.length;
    nodes.push(body.slice(last, start), <span key={start} className="ath-mention ath-mono">{m[2]}</span>);
    last = start + m[2]!.length;
  }
  nodes.push(body.slice(last));
  return <p className="ath-comment__body">{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</p>;
}

/**
 * Zone de commentaire avec autocomplétion des mentions : `@` ouvre la liste des personnes qui peuvent lire l'item (le serveur filtre
 * selon les droits). Flèches pour choisir, Entrée ou Tab pour insérer, Échap pour fermer.
 */
export function MentionInput({ id, project, itemKey, value, onChange, rows = 3 }: {
  id: string; project: string; itemKey: string; value: string; onChange: (value: string) => void; rows?: number;
}) {
  const listId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const request = useRef(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState(0);
  const [token, setToken] = useState<{ start: number; query: string } | null>(null);
  const open = token !== null && people.length > 0;

  useEffect(() => {
    if (token === null) { setPeople([]); return; }
    const mine = ++request.current;
    api<Person[]>('GET', `/v1/projects/${project}/artifacts/${encodeURIComponent(itemKey)}/mentionable?q=${encodeURIComponent(token.query)}`)
      .then((list) => { if (mine === request.current) { setPeople(Array.isArray(list) ? list : []); setActive(0); } })
      .catch(() => { if (mine === request.current) setPeople([]); });
  }, [token, project, itemKey]);

  const locate = (text: string, caret: number) => {
    const m = OPEN_TOKEN.exec(text.slice(0, caret));
    setToken(m ? { start: caret - m[2]!.length - 1, query: m[2]! } : null);
  };
  const pick = (person: Person) => {
    if (!token || !area.current) return;
    const caret = area.current.selectionStart;
    const next = `${value.slice(0, token.start)}@${person.username} ${value.slice(caret)}`;
    onChange(next);
    setToken(null);
    const position = token.start + person.username.length + 2;
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(position, position); });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % people.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + people.length) % people.length); }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pick(people[active]!); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setToken(null); }
  };

  return (
    <div className="ath-mention-input">
      <textarea
        id={id} ref={area} className="ath-input" rows={rows} value={value}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox"
        {...(open ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
        onChange={(e) => { onChange(e.target.value); locate(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKeyDown}
        onClick={(e) => locate(value, e.currentTarget.selectionStart)}
        onBlur={() => setToken(null)}
      />
      <ul id={listId} role="listbox" aria-label={fr.mention.list} className="ath-mention-input__list" hidden={!open}>
        {people.map((p, i) => (
          <li key={p.username} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'ath-mention-input__option ath-mention-input__option--active' : 'ath-mention-input__option'}
            onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
            <span>{p.displayName}</span> <span className="ath-mono">@{p.username}</span>
          </li>
        ))}
      </ul>
      <span className="ath-visually-hidden" role="status">{open ? fr.mention.count(people.length) : ''}</span>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Btn, Modal, Select, Textarea, useToast } from '@athena/ui';
import { api, currentUser, type Artifact, type Field, type TrackerDefinition } from '../api';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';
import { projectOfTarget, targetOf, trackerOfTarget, type CreateTarget, type Created } from '../lib/create-target';

export function coerce(field: Field, raw: string): unknown {
  if (raw.trim() === '') return undefined;
  if (field.type === 'number') return Number(raw);
  if (field.type === 'checkbox') return raw === 'true';
  if (field.type === 'multiselect') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return raw;
}

function Input({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const id = `new-${field.key}`;
  const label = field.required ? `${field.label} (${fr.artifact.required})` : field.label;
  const options = (field.config['options'] as string[] | undefined) ?? [];
  return (
    <div className="ath-field">
      <label className="ath-field__label" htmlFor={id}>{label}</label>
      {field.type === 'select' ? (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      ) : field.type === 'user' ? (
        <Assignee id={id} value={value} onChange={onChange} />
      ) : field.type === 'richtext' ? (
        <Textarea id={id} rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={`ath-input${field.type === 'number' || field.type === 'date' ? ' ath-mono' : ''}`} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={field.key === 'title' ? fr.create.titleExample : undefined} />
      )}
    </div>
  );
}

/** Responsable : « Moi » en un clic ; le compte choisi s'affiche par son nom (T-0146). */
function Assignee({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const me = currentUser();
  if (me && value === me.id) return <div className="ath-row"><span id={id}>{fr.create.you(me.name)}</span><Btn variant="ghost" size="sm" onClick={() => onChange('')}>{fr.create.change}</Btn></div>;
  return (
    <div className="ath-row">
      <input id={id} className="ath-input" type="text" value={value} placeholder={fr.create.assigneePlaceholder} onChange={(e) => onChange(e.target.value)} />
      {me && <Btn variant="ghost" size="sm" onClick={() => onChange(me.id)}>{fr.create.me}</Btn>}
    </div>
  );
}

/** D'abord les champs obligatoires et la description ; les autres attendent sous « Plus de champs » (T-0146). */
export const essential = (f: Field) => f.required || f.key === 'description';

interface Option { key: string; name: string }

/**
 * Création d'un ticket. En portée globale on choisit le projet, puis le tracker ; dans un projet, le tracker ; dans un tracker,
 * il est pré-choisi et reste modifiable. Le formulaire est généré depuis la définition du tracker choisi.
 */
export function CreateArtifact({ target, open, onClose, onCreated }: {
  target: CreateTarget; open: boolean; onClose: () => void; onCreated: (created: Created) => void;
}) {
  const fail = useFailure();
  const { busy, guard } = useBusy();
  const [projects, setProjects] = useState<Option[]>([]);
  const [project, setProject] = useState(projectOfTarget(target) ?? '');
  const [trackers, setTrackers] = useState<Option[] | null>(null);
  const [tracker, setTracker] = useState(trackerOfTarget(target) ?? '');
  const [definition, setDefinition] = useState<TrackerDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  // Les effets dépendent d'une clé stable : l'appelant peut recréer l'objet cible à chaque rendu.
  const targetKey = `${target.scope}:${projectOfTarget(target) ?? ''}:${trackerOfTarget(target) ?? ''}`;
  const current = useRef(target);
  current.current = target;

  // À chaque ouverture, la cible du contexte s'applique de nouveau.
  useEffect(() => {
    if (!open) return;
    const t = current.current;
    setProject(projectOfTarget(t) ?? '');
    setTracker(trackerOfTarget(t) ?? '');
    setValues({});
    setMore(false);
    if (t.scope === 'global') api<Option[]>('GET', '/v1/projects').then((p) => { setProjects(p); if (p.length === 1) setProject(p[0]!.key); }).catch(fail);
  }, [open, targetKey, fail]);
  // Trackers du projet choisi ; si la liste est indisponible, le tracker pré-choisi reste seul proposé.
  useEffect(() => {
    if (!open || !project) { setTrackers(null); return; }
    const fallback = trackerOfTarget(current.current);
    api<Option[]>('GET', `/v1/projects/${project}/trackers`)
      .then((t) => { setTrackers(t); setTracker((current) => (t.some((x) => x.key === current) ? current : t[0]?.key ?? '')); })
      .catch(() => setTrackers(fallback ? [{ key: fallback, name: fallback }] : []));
  }, [open, project, targetKey]);
  useEffect(() => {
    setDefinition(null);
    if (!open || !project || !tracker) return;
    api<TrackerDefinition>('GET', `/v1/projects/${project}/trackers/${tracker}`).then(setDefinition).catch(fail);
  }, [open, project, tracker, fail]);

  const submit = (event: FormEvent) => { event.preventDefault(); void guard(() => submitRun()); };
  const submitRun = async () => {
    if (!definition) return;
    const payload: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = coerce(field, values[field.key] ?? '');
      if (value !== undefined) payload[field.key] = value;
    }
    try {
      const created = await api<Artifact>('POST', `/v1/projects/${project}/trackers/${tracker}/artifacts`, { values: payload });
      onCreated({ key: created.key, project, tracker });
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Modal open={open} title={fr.create.title} size="md" onClose={onClose}
      footer={<><span className="ath-field__hint ath-create__keys">{fr.create.keys}</span><Btn variant="ghost" onClick={onClose}>{fr.create.cancel}</Btn><Btn type="submit" form="create-artifact" loading={busy} disabled={!definition}>{fr.create.submitLong}</Btn></>}>
      <form id="create-artifact" className="ath-stack" onSubmit={submit}>
        {target.scope === 'global' && (
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="new-project">{fr.create.project}</label>
            <Select id="new-project" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="" />
              {projects.map((p) => <option key={p.key} value={p.key}>{p.key} · {p.name}</option>)}
            </Select>
          </div>
        )}
        {project && trackers !== null && (trackers.length === 0 ? <p>{fr.create.noTracker}</p> : (
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="new-tracker">{fr.create.tracker}</label>
            <Select id="new-tracker" value={tracker} onChange={(e) => setTracker(e.target.value)}>
              {trackers.map((t) => <option key={t.key} value={t.key}>{t.key} · {t.name}</option>)}
            </Select>
          </div>
        ))}
        {definition && (() => {
          const field = (f: Field) => <Input key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />;
          const main = definition.fields.filter(essential);
          const rest = definition.fields.filter((f) => !essential(f));
          return <>
            {main.map(field)}
            {rest.length > 0 && <div><Btn variant="ghost" size="sm" aria-expanded={more} onClick={() => setMore(!more)}>{more ? fr.create.less : fr.create.more(rest.length, rest.map((f) => f.label.toLowerCase()).join(', '))}</Btn></div>}
            {more && rest.map(field)}
          </>;
        })()}
      </form>
    </Modal>
  );
}

type CreatedHandler = (created: Created) => void;
interface CreateApi { open: (target?: CreateTarget) => void; onCreated: (handler: CreatedHandler) => () => void }
const CreateContext = createContext<CreateApi>({ open: () => undefined, onCreated: () => () => undefined });

/** Ouvre la création ; sans cible, celle de la page (`targetOf`). */
export const useCreate = () => useContext(CreateContext).open;

/** La page courante réagit à une création (ouvrir le panneau, recharger sa liste) ; on reste sur la page (ADR-0003 § 2.5). */
export function useOnCreated(handler: CreatedHandler): void {
  const { onCreated } = useContext(CreateContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onCreated((c) => latest.current(c)), [onCreated]);
}

/**
 * Création disponible partout : bouton « Créer » de la barre haute, raccourci N (hors saisie et hors dialogue) et boutons des
 * pages. Après création, on reste sur la page ; le message propose d'ouvrir le ticket.
 */
export function CreateProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const handlers = useRef(new Set<CreatedHandler>());
  const here = useRef(pathname);
  here.current = pathname;
  const open = useCallback((next?: CreateTarget) => setTarget(next ?? targetOf(here.current)), []);
  const onCreated = useCallback((handler: CreatedHandler) => { handlers.current.add(handler); return () => { handlers.current.delete(handler); }; }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      open();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const value = useMemo(() => ({ open, onCreated }), [open, onCreated]);
  const done = (created: Created) => {
    setTarget(null);
    toast('success', fr.create.created(created.key), { label: fr.create.openIt(created.key), onClick: () => navigate(`/p/${created.project}/a/${created.key}`) });
    for (const handler of handlers.current) handler(created);
  };
  return (
    <CreateContext.Provider value={value}>
      {children}
      {target && <CreateArtifact target={target} open onClose={() => setTarget(null)} onCreated={done} />}
    </CreateContext.Provider>
  );
}


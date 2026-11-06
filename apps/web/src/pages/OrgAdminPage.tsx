import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, EmptyState, Field, PageHeader, Table, Tabs, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { ProjectTemplateEditor } from '../components/ProjectTemplateEditor';
import { TrackerTemplateForm, type TrackerTemplateEntry } from '../components/TrackerTemplateForm';
import { useConfirm } from '../components/ConfirmDialog';
import { LinkTypesTab } from '../components/LinkTypesTab';
import { TrackerTypesTab } from '../components/TrackerTypesTab';
import { useBusy, useFailure } from '../hooks';
import { fr } from '../i18n';

export interface UserEntry { subject: string; username: string; displayName: string; email: string | null }
export interface MemberEntry extends UserEntry { role: 'manager' | 'member' }
export interface TemplateEntry {
  key: string; name: string; description: string; builtin: boolean; modified?: boolean;
  trackers: Array<{ key: string; name: string; fields: Array<{ label: string }>; statuses: unknown[]; transitions: unknown[] }>;
}
interface PluginEntry { id: string; name: string; version: string; enabled: boolean; permissions: string[] }

function ProjectsTab({ users, templates }: { users: UserEntry[]; templates: TemplateEntry[] }) {
  const { busy, guard } = useBusy();
  const toast = useToast();
  const fail = useFailure();
  const [projects, setProjects] = useState<Array<{ key: string; name: string; managers: MemberEntry[] }>>([]);
  const [form, setForm] = useState({ key: '', name: '', template: '' });
  const [pick, setPick] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const list = await api<Array<{ key: string; name: string }>>('GET', '/v1/projects');
    setProjects(await Promise.all(list.map(async (p) => ({ ...p, managers: (await api<MemberEntry[]>('GET', `/v1/projects/${p.key}/members`)).filter((m) => m.role === 'manager') }))));
  }, []);
  useEffect(() => { load().catch(fail); }, [load, fail]);
  const create = (event: FormEvent) => { event.preventDefault(); void guard(() => createRun()); };
  const createRun = async () => {
    try {
      await api('POST', '/v1/projects', { key: form.key, name: form.name, ...(form.template ? { template: form.template } : {}) });
      toast('success', fr.org.projectCreated(form.key));
      setForm({ key: '', name: '', template: form.template });
      await load();
    } catch (error) { fail(error); }
  };
  const assign = async (project: string) => {
    try {
      await api('PUT', `/v1/projects/${project}/members/${encodeURIComponent(pick[project]!)}`, { role: 'manager' });
      toast('success', fr.org.managerSet);
      setPick({ ...pick, [project]: '' });
      await load();
    } catch (error) { fail(error); }
  };
  const revoke = async (project: string, subject: string) => {
    try {
      await api('DELETE', `/v1/projects/${project}/members/${encodeURIComponent(subject)}`); // sans confirmation : réversible (le rôle se redonne)
      toast('success', fr.org.managerRemoved);
      await load();
    } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      <form className="ath-toolbar" onSubmit={create}>
        <Field label={fr.org.projectKey} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} mono />
        <Field label={fr.org.projectName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="ath-field">
          <label className="ath-field__label" htmlFor="project-template">{fr.org.template}</label>
          <select id="project-template" className="ath-select" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
            <option value="">{fr.org.noTemplate}</option>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.trackers.length})</option>)}
          </select>
        </div>
        <Btn type="submit" loading={busy} disabled={form.key.length < 2 || !form.name.trim()}>{fr.org.createProject}</Btn>
      </form>
      {projects.length === 0 ? <EmptyState eyebrow={fr.org.projects} title={fr.admin.empty} /> : (
        <div className="ath-grid-2">
          {projects.map((p) => (
            <Card key={p.key} title={p.name} meta={p.key}>
              <div className="ath-stack">
                <span className="ath-eyebrow">{fr.org.managers}</span>
                {p.managers.length === 0 && <p>{fr.org.noManager}</p>}
                {p.managers.map((m) => (
                  <div key={m.subject} className="ath-row"><span>{m.displayName}</span> <span className="ath-mono">{m.username}</span>
                    <Btn size="sm" variant="ghost" aria-label={`${fr.org.revoke} ${m.username}`} onClick={() => revoke(p.key, m.subject)}>{fr.org.revoke}</Btn></div>
                ))}
                <div className="ath-toolbar">
                  <div className="ath-field">
                    <label className="ath-field__label" htmlFor={`mgr-${p.key}`}>{fr.org.assignManager}</label>
                    <select id={`mgr-${p.key}`} className="ath-select" value={pick[p.key] ?? ''} onChange={(e) => setPick({ ...pick, [p.key]: e.target.value })}>
                      <option value="">{fr.org.chooseUser}</option>
                      {users.map((u) => <option key={u.subject} value={u.subject}>{u.displayName} ({u.username})</option>)}
                    </select>
                  </div>
                  <Btn size="sm" disabled={!pick[p.key]} onClick={() => assign(p.key)}>{fr.org.assignManager}</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectTemplates({ templates, trackerTemplates, reload, reloadTrackerTemplates }: {
  templates: TemplateEntry[]; trackerTemplates: TrackerTemplateEntry[]; reload: () => Promise<void>; reloadTrackerTemplates: () => Promise<void>;
}) {
  const toast = useToast();
  const fail = useFailure();
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [projectTrackers, setProjectTrackers] = useState<Array<{ key: string; name: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: '', name: '', description: '', project: '', picked: [] as string[], tplPicked: [] as string[] });
  useEffect(() => { api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then(setProjects).catch(fail); }, [fail]);
  const chooseProject = async (project: string) => {
    setForm((f) => ({ ...f, project, picked: [] }));
    if (!project) { setProjectTrackers([]); return; }
    try {
      const list = await api<Array<{ key: string; name: string }>>('GET', `/v1/projects/${project}/trackers`);
      setProjectTrackers(list);
      setForm((f) => ({ ...f, picked: list.map((t) => t.key) }));
    } catch (error) { fail(error); }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', '/v1/project-templates', {
        key: form.key, name: form.name, ...(form.description ? { description: form.description } : {}),
        ...(form.project && form.picked.length ? { fromProject: { project: form.project, trackers: form.picked } } : {}),
        ...(form.tplPicked.length ? { trackerTemplates: form.tplPicked } : {}),
      });
      toast('success', fr.org.templateCreated);
      setForm({ key: '', name: '', description: '', project: '', picked: [], tplPicked: [] });
      setProjectTrackers([]);
      await reload();
    } catch (error) { fail(error); }
  };
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const remove = async (t: TemplateEntry) => {
    const reset = t.builtin;
    if (!(await confirm.ask(reset
      ? { title: fr.builder.resetTitle(t.name), body: fr.builder.resetBody, confirm: fr.builder.reset }
      : { title: fr.confirm.deleteTitle(t.key), body: fr.confirm.deleteTemplate, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/project-templates/${t.key}`); toast('success', reset ? fr.builder.resetDone : fr.org.templateDeleted); setEditing(null); await reload(); } catch (error) { fail(error); }
  };
  const nothing = form.picked.length === 0 && form.tplPicked.length === 0;
  return (
    <div className="ath-stack">
      {confirm.dialog}
      <Table>
        <thead><tr><Th>{fr.config.name}</Th><Th>{fr.org.trackersCount}</Th><Th>{fr.org.attributes}</Th><Th>{fr.builder.edit}</Th></tr></thead>
        <tbody>{templates.map((t) => (
          <tr key={t.key}>
            <Td>{t.name} <span className="ath-mono">{t.key}</span>{t.builtin && <> <Tag>{fr.org.builtin}</Tag></>}{t.modified && <> <Tag>{fr.builder.modified}</Tag></>}</Td>
            <Td>{t.trackers.length === 0 ? '—' : t.trackers.map((k) => <div key={k.key}><span className="ath-mono">{k.key}</span> {k.name}</div>)}</Td>
            <Td>{t.trackers.length === 0 ? '—' : t.trackers.map((k) => <div key={k.key}>{k.fields.map((f) => f.label).join(', ')}</div>)}</Td>
            <Td>
              <span className="ath-row">
                <Btn size="sm" variant="ghost" aria-label={`${fr.builder.edit} ${t.name}`} onClick={() => setEditing(t.key)}>{fr.builder.edit}</Btn>
                {t.builtin ? (t.modified && <Btn size="sm" variant="ghost" aria-label={`${fr.builder.reset} ${t.name}`} onClick={() => remove(t)}>{fr.builder.reset}</Btn>)
                  : <Btn size="sm" variant="ghost" aria-label={`${fr.org.deleteTemplate} ${t.name}`} onClick={() => remove(t)}>{fr.org.deleteTemplate}</Btn>}
              </span>
            </Td>
          </tr>
        ))}</tbody>
      </Table>
      {editing && templates.some((t) => t.key === editing) && (
        <section className="ath-stack" aria-label={fr.builder.editing(editing)}>
          <ProjectTemplateEditor key={editing} template={templates.find((t) => t.key === editing)!} trackerTemplates={trackerTemplates}
            onSaved={async () => { setEditing(null); await reload(); }} onCancel={() => setEditing(null)} />
        </section>
      )}
      <form className="ath-stack" onSubmit={create}>
        <div className="ath-toolbar">
          <Field label={fr.org.templateKey} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} mono />
          <Field label={fr.org.templateName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label={fr.org.templateDescription} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <fieldset className="ath-row">
          <legend className="ath-field__label">{fr.builder.trackerTemplates}</legend>
          {trackerTemplates.map((t) => (
            <label key={t.key} className="ath-row"><input type="checkbox" checked={form.tplPicked.includes(t.key)}
              onChange={(e) => setForm({ ...form, tplPicked: e.target.checked ? [...form.tplPicked, t.key] : form.tplPicked.filter((x) => x !== t.key) })} />{t.name} <span className="ath-mono">{t.tracker.key}</span></label>
          ))}
        </fieldset>
        <div className="ath-toolbar">
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="template-project">{fr.org.fromProject}</label>
            <select id="template-project" className="ath-select" value={form.project} onChange={(e) => void chooseProject(e.target.value)}>
              <option value="" />{projects.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </div>
          <Btn type="button" variant="ghost" onClick={() => setCreating(!creating)} aria-expanded={creating}>{fr.builder.newTrackerForTemplate}</Btn>
        </div>
        {projectTrackers.length > 0 && (
          <fieldset className="ath-row">
            <legend className="ath-field__label">{fr.org.pickTrackers}</legend>
            {projectTrackers.map((t) => (
              <label key={t.key} className="ath-row"><input type="checkbox" checked={form.picked.includes(t.key)}
                onChange={(e) => setForm({ ...form, picked: e.target.checked ? [...form.picked, t.key] : form.picked.filter((x) => x !== t.key) })} /><span className="ath-mono">{t.key}</span> {t.name}</label>
            ))}
          </fieldset>
        )}
        <div><Btn type="submit" disabled={!/^[a-z][a-z0-9-]{1,39}$/.test(form.key) || !form.name.trim() || nothing}>{fr.org.createTemplate}</Btn></div>
      </form>
      {creating && (
        <section className="ath-stack" aria-label={fr.builder.newTrackerForTemplate}>
          <h2 className="ath-label">{fr.builder.newTrackerForTemplate}</h2>
          <TrackerTemplateForm templates={trackerTemplates} onCreated={async (key) => {
            await reloadTrackerTemplates();
            setForm((f) => ({ ...f, tplPicked: [...f.tplPicked, key] }));
            setCreating(false);
            toast('success', fr.builder.addedTracker(key));
          }} />
        </section>
      )}
    </div>
  );
}

function TrackerTemplates({ templates, reload }: { templates: TrackerTemplateEntry[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const fail = useFailure();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const remove = async (t: TrackerTemplateEntry) => {
    const reset = t.builtin;
    if (!(await confirm.ask(reset
      ? { title: fr.builder.resetTitle(t.name), body: fr.builder.resetBody, confirm: fr.builder.reset }
      : { title: fr.confirm.deleteTitle(t.key), body: fr.confirm.deleteTemplate, confirm: fr.confirm.delete }))) return;
    try { await api('DELETE', `/v1/tracker-templates/${t.key}`); toast('success', reset ? fr.builder.resetDone : fr.builder.trackerTemplateDeleted); setEditing(null); await reload(); } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      {confirm.dialog}
      <Table>
        <thead><tr><Th>{fr.config.name}</Th><Th>{fr.org.attributes}</Th><Th>{fr.config.statuses}</Th><Th>{fr.builder.edit}</Th></tr></thead>
        <tbody>{templates.map((t) => (
          <tr key={t.key}>
            <Td>{t.name} <span className="ath-mono">{t.key}</span>{t.builtin && <> <Tag>{fr.org.builtin}</Tag></>}{t.modified && <> <Tag>{fr.builder.modified}</Tag></>}</Td>
            <Td>{t.tracker.fields.map((f) => f.label).join(', ')}</Td>
            <Td>{t.tracker.statuses.map((x) => x.name).join(' → ')}</Td>
            <Td>
              <span className="ath-row">
                <Btn size="sm" variant="ghost" aria-label={`${fr.builder.edit} ${t.name}`} onClick={() => setEditing(t.key)}>{fr.builder.edit}</Btn>
                {t.builtin ? (t.modified && <Btn size="sm" variant="ghost" aria-label={`${fr.builder.reset} ${t.name}`} onClick={() => remove(t)}>{fr.builder.reset}</Btn>)
                  : <Btn size="sm" variant="ghost" aria-label={`${fr.org.deleteTemplate} ${t.name}`} onClick={() => remove(t)}>{fr.org.deleteTemplate}</Btn>}
              </span>
            </Td>
          </tr>
        ))}</tbody>
      </Table>
      {editing && templates.find((t) => t.key === editing) ? (
        <section className="ath-stack" aria-label={fr.builder.editing(editing)}>
          <h2 className="ath-label">{fr.builder.editing(templates.find((t) => t.key === editing)!.name)}</h2>
          {templates.find((t) => t.key === editing)!.builtin && <p className="ath-eyebrow">{fr.builder.builtinNote}</p>}
          <TrackerTemplateForm key={editing} templates={templates} edit={templates.find((t) => t.key === editing)!}
            onCreated={async () => { setEditing(null); await reload(); }} onCancel={() => setEditing(null)} />
        </section>
      ) : <TrackerTemplateForm templates={templates} onCreated={reload} />}
    </div>
  );
}

function TemplatesTab({ templates, trackerTemplates, reload, reloadTrackerTemplates }: {
  templates: TemplateEntry[]; trackerTemplates: TrackerTemplateEntry[]; reload: () => Promise<void>; reloadTrackerTemplates: () => Promise<void>;
}) {
  const [sub, setSub] = useState('project');
  return (
    <div className="ath-stack">
      <Tabs tabs={[{ id: 'project', label: fr.builder.projectTemplates }, { id: 'tracker', label: fr.builder.trackerTemplates }]} active={sub} onChange={setSub} />
      <div role="tabpanel" className="ath-stack">
        {sub === 'project' && <ProjectTemplates templates={templates} trackerTemplates={trackerTemplates} reload={reload} reloadTrackerTemplates={reloadTrackerTemplates} />}
        {sub === 'tracker' && <TrackerTemplates templates={trackerTemplates} reload={reloadTrackerTemplates} />}
      </div>
    </div>
  );
}

function UsersTab({ users }: { users: UserEntry[] }) {
  return (
    <div className="ath-stack">
      <p className="ath-eyebrow">{fr.org.usersNote}</p>
      {users.length === 0 ? <EmptyState eyebrow={fr.org.users} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.org.displayName}</Th><Th>{fr.org.username}</Th><Th>{fr.org.email}</Th></tr></thead>
          <tbody>{users.map((u) => <tr key={u.subject}><Td>{u.displayName}</Td><Td mono>{u.username}</Td><Td mono>{u.email ?? '—'}</Td></tr>)}</tbody>
        </Table>
      )}
    </div>
  );
}

function PluginsTab() {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<PluginEntry[]>([]);
  const [raw, setRaw] = useState('');
  const [grants, setGrants] = useState<string[]>([]);
  const load = useCallback(() => api<PluginEntry[]>('GET', '/v1/plugins').then(setItems).catch(fail), [fail]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (p: PluginEntry) => {
    try { await api('POST', `/v1/plugins/${p.id}/${p.enabled ? 'disable' : 'enable'}`); toast('success', fr.admin.toggled); await load(); } catch (error) { fail(error); }
  };
  const confirm = useConfirm();
  const uninstall = async (p: PluginEntry) => {
    if (!(await confirm.ask({ title: fr.confirm.uninstallTitle(p.name), body: fr.confirm.uninstallBody, confirm: fr.confirm.uninstall }))) return;
    try { await api('DELETE', `/v1/plugins/${p.id}`); toast('success', fr.org.uninstalled); await load(); } catch (error) { fail(error); }
  };
  const install = async (event: FormEvent) => {
    event.preventDefault();
    let pkg: unknown;
    try { pkg = JSON.parse(raw); } catch { toast('danger', fr.org.badPackage); return; }
    try { await api('POST', '/v1/plugins', { package: pkg, granted: grants }); toast('success', fr.org.installed); setRaw(''); await load(); } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      {confirm.dialog}
      {items.length === 0 ? <EmptyState eyebrow={fr.org.plugins} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.config.name}</Th><Th>{fr.artifact.version}</Th><Th>Permissions</Th><Th>{fr.admin.active}</Th><Th>{fr.org.uninstall}</Th></tr></thead>
          <tbody>{items.map((p) => (
            <tr key={p.id}><Td>{p.name} <span className="ath-mono">{p.id}</span></Td><Td mono>{p.version}</Td><Td mono>{p.permissions.join(', ') || '—'}</Td>
              <Td><Btn size="sm" variant="ghost" onClick={() => toggle(p)}>{p.enabled ? fr.admin.disable : fr.admin.enable}</Btn></Td>
              <Td><Btn size="sm" variant="ghost" onClick={() => uninstall(p)}>{fr.org.uninstall}</Btn></Td></tr>
          ))}</tbody>
        </Table>
      )}
      <form className="ath-stack" onSubmit={install}>
        <span className="ath-eyebrow">{fr.org.install}</span>
        <label className="ath-field__label" htmlFor="plugin-package">{fr.org.packageJson}</label>
        <textarea id="plugin-package" className="ath-input ath-mono" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} />
        <fieldset className="ath-row">
          <legend className="ath-field__label">{fr.org.grants}</legend>
          {['storage', 'artifacts:read'].map((g) => (
            <label key={g} className="ath-row"><input type="checkbox" checked={grants.includes(g)} onChange={(e) => setGrants(e.target.checked ? [...grants, g] : grants.filter((x) => x !== g))} /><span className="ath-mono">{g}</span></label>
          ))}
        </fieldset>
        <div><Btn type="submit" disabled={!raw.trim()}>{fr.org.installAction}</Btn></div>
      </form>
    </div>
  );
}

/** Fenêtre de l'administrateur : création et attribution des projets, comptes, plugins. */
export function OrgAdminPage({ session }: { session: Session }) {
  const fail = useFailure();
  const [tab, setTab] = useState('projects');
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [trackerTemplates, setTrackerTemplates] = useState<TrackerTemplateEntry[]>([]);
  const loadTrackerTemplates = useCallback(async () => setTrackerTemplates(await api<TrackerTemplateEntry[]>('GET', '/v1/tracker-templates')), []);
  const loadTemplates = useCallback(async () => setTemplates(await api<TemplateEntry[]>('GET', '/v1/project-templates')), []);
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  useEffect(() => { if (admin) { api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(fail); loadTemplates().catch(fail); loadTrackerTemplates().catch(fail); } }, [admin, fail, loadTemplates, loadTrackerTemplates]);
  if (!admin) return <><PageHeader eyebrow={fr.org.eyebrow} title={fr.org.title} /><p className="ath-field__error">{fr.config.adminOnly}</p></>;
  return (
    <>
      <PageHeader eyebrow={fr.org.eyebrow} title={fr.org.title} />
      <Tabs tabs={[{ id: 'projects', label: fr.org.projects }, { id: 'templates', label: fr.org.templates }, { id: 'types', label: fr.org.trackerTypes }, { id: 'linktypes', label: fr.org.linkTypes }, { id: 'users', label: fr.org.users }, { id: 'plugins', label: fr.org.plugins }]} active={tab} onChange={setTab} />
      <div role="tabpanel" className="ath-stack">
        {tab === 'projects' && <ProjectsTab users={users} templates={templates} />}
        {tab === 'templates' && <TemplatesTab templates={templates} trackerTemplates={trackerTemplates} reload={loadTemplates} reloadTrackerTemplates={loadTrackerTemplates} />}
        {tab === 'types' && <TrackerTypesTab />}
        {tab === 'linktypes' && <LinkTypesTab />}
        {tab === 'users' && <UsersTab users={users} />}
        {tab === 'plugins' && <PluginsTab />}
      </div>
    </>
  );
}

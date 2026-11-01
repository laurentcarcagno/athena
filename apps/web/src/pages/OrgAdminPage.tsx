import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, EmptyState, Field, PageHeader, Table, Tabs, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

export interface UserEntry { subject: string; username: string; displayName: string; email: string | null }
export interface MemberEntry extends UserEntry { role: 'manager' | 'member' }
export interface TemplateEntry {
  key: string; name: string; description: string; builtin: boolean;
  trackers: Array<{ key: string; name: string; fields: Array<{ label: string }>; statuses: unknown[]; transitions: unknown[] }>;
}
interface PluginEntry { id: string; name: string; version: string; enabled: boolean; permissions: string[] }

function ProjectsTab({ users, templates }: { users: UserEntry[]; templates: TemplateEntry[] }) {
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
  const create = async (event: FormEvent) => {
    event.preventDefault();
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
      await api('DELETE', `/v1/projects/${project}/members/${encodeURIComponent(subject)}`);
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
        <Btn type="submit" disabled={form.key.length < 2 || !form.name.trim()}>{fr.org.createProject}</Btn>
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

function TemplatesTab({ templates, reload }: { templates: TemplateEntry[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const fail = useFailure();
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [trackers, setTrackers] = useState<Array<{ key: string; name: string }>>([]);
  const [form, setForm] = useState({ key: '', name: '', description: '', project: '', picked: [] as string[] });
  useEffect(() => { api<Array<{ key: string; name: string }>>('GET', '/v1/projects').then(setProjects).catch(fail); }, [fail]);
  const chooseProject = async (project: string) => {
    setForm((f) => ({ ...f, project, picked: [] }));
    if (!project) { setTrackers([]); return; }
    try {
      const list = await api<Array<{ key: string; name: string }>>('GET', `/v1/projects/${project}/trackers`);
      setTrackers(list);
      setForm((f) => ({ ...f, picked: list.map((t) => t.key) }));
    } catch (error) { fail(error); }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', '/v1/project-templates', { key: form.key, name: form.name, ...(form.description ? { description: form.description } : {}), fromProject: { project: form.project, trackers: form.picked } });
      toast('success', fr.org.templateCreated);
      setForm({ key: '', name: '', description: '', project: '', picked: [] });
      setTrackers([]);
      await reload();
    } catch (error) { fail(error); }
  };
  const remove = async (key: string) => {
    try { await api('DELETE', `/v1/project-templates/${key}`); toast('success', fr.org.templateDeleted); await reload(); } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      <Table>
        <thead><tr><Th>{fr.config.name}</Th><Th>{fr.org.trackersCount}</Th><Th>{fr.org.attributes}</Th><Th>{fr.org.deleteTemplate}</Th></tr></thead>
        <tbody>{templates.map((t) => (
          <tr key={t.key}>
            <Td>{t.name} <span className="ath-mono">{t.key}</span>{t.builtin && <> <Tag>{fr.org.builtin}</Tag></>}</Td>
            <Td>{t.trackers.length === 0 ? '—' : t.trackers.map((k) => <div key={k.key}><span className="ath-mono">{k.key}</span> {k.name}</div>)}</Td>
            <Td>{t.trackers.length === 0 ? '—' : t.trackers.map((k) => <div key={k.key}>{k.fields.map((f) => f.label).join(', ')}</div>)}</Td>
            <Td>{!t.builtin && <Btn size="sm" variant="ghost" aria-label={`${fr.org.deleteTemplate} ${t.name}`} onClick={() => remove(t.key)}>{fr.org.deleteTemplate}</Btn>}</Td>
          </tr>
        ))}</tbody>
      </Table>
      <form className="ath-stack" onSubmit={create}>
        <div className="ath-toolbar">
          <Field label={fr.org.templateKey} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} mono />
          <Field label={fr.org.templateName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label={fr.org.templateDescription} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="ath-field">
            <label className="ath-field__label" htmlFor="template-project">{fr.org.fromProject}</label>
            <select id="template-project" className="ath-select" value={form.project} onChange={(e) => void chooseProject(e.target.value)}>
              <option value="" />{projects.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </div>
        </div>
        {trackers.length > 0 && (
          <fieldset className="ath-row">
            <legend className="ath-field__label">{fr.org.pickTrackers}</legend>
            {trackers.map((t) => (
              <label key={t.key} className="ath-row"><input type="checkbox" checked={form.picked.includes(t.key)}
                onChange={(e) => setForm({ ...form, picked: e.target.checked ? [...form.picked, t.key] : form.picked.filter((x) => x !== t.key) })} /><span className="ath-mono">{t.key}</span> {t.name}</label>
            ))}
          </fieldset>
        )}
        <div><Btn type="submit" disabled={!/^[a-z][a-z0-9-]{1,39}$/.test(form.key) || !form.name.trim() || !form.project || form.picked.length === 0}>{fr.org.createTemplate}</Btn></div>
      </form>
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
  const uninstall = async (p: PluginEntry) => {
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
  const loadTemplates = useCallback(async () => setTemplates(await api<TemplateEntry[]>('GET', '/v1/project-templates')), []);
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  useEffect(() => { if (admin) { api<UserEntry[]>('GET', '/v1/users').then(setUsers).catch(fail); loadTemplates().catch(fail); } }, [admin, fail, loadTemplates]);
  if (!admin) return <><PageHeader eyebrow={fr.org.eyebrow} title={fr.org.title} /><p className="ath-field__error">{fr.config.adminOnly}</p></>;
  return (
    <>
      <PageHeader eyebrow={fr.org.eyebrow} title={fr.org.title} />
      <Tabs tabs={[{ id: 'projects', label: fr.org.projects }, { id: 'templates', label: fr.org.templates }, { id: 'users', label: fr.org.users }, { id: 'plugins', label: fr.org.plugins }]} active={tab} onChange={setTab} />
      <div role="tabpanel" className="ath-stack">
        {tab === 'projects' && <ProjectsTab users={users} templates={templates} />}
        {tab === 'templates' && <TemplatesTab templates={templates} reload={loadTemplates} />}
        {tab === 'users' && <UsersTab users={users} />}
        {tab === 'plugins' && <PluginsTab />}
      </div>
    </>
  );
}

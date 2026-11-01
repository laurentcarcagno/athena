import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card, EmptyState, Field, PageHeader, StatusPill, Table, Tabs, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Webhook { id: string; url: string; eventTypes: string[]; active: boolean }
interface Rule { id: string; name: string; enabled: boolean; trigger: string; condition: string }
interface PluginEntry { id: string; name: string; version: string; enabled: boolean; permissions: string[] }
interface Baseline { name: string; gitSha: string; createdAt: string }

function WebhooksTab() {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Webhook[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('artifact.*');
  const [secret, setSecret] = useState<string | null>(null);
  const load = useCallback(() => api<Webhook[]>('GET', '/v1/webhooks').then(setItems).catch(fail), [fail]);
  useEffect(() => { void load(); }, [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await api<{ secret: string }>('POST', '/v1/webhooks', { url, eventTypes: events.split(',').map((e) => e.trim()).filter(Boolean) });
      setSecret(created.secret);
      setUrl('');
      toast('success', fr.admin.createdWebhook);
      await load();
    } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      {secret && <Card title={fr.admin.secret}><span className="ath-mono">{secret}</span></Card>}
      {items.length === 0 ? <EmptyState eyebrow={fr.admin.webhooks} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>URL</Th><Th>{fr.admin.events}</Th><Th>{fr.admin.active}</Th></tr></thead>
          <tbody>{items.map((w) => <tr key={w.id}><Td mono>{w.url}</Td><Td mono>{w.eventTypes.join(', ')}</Td><Td><StatusPill kind={w.active ? 'success' : 'danger'}>{w.active ? fr.admin.active : fr.admin.inactive}</StatusPill></Td></tr>)}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={create}>
        <Field label={fr.admin.url} value={url} onChange={(e) => setUrl(e.target.value)} mono />
        <Field label={fr.admin.events} value={events} onChange={(e) => setEvents(e.target.value)} mono />
        <Btn type="submit" disabled={!url}>{fr.admin.create}</Btn>
      </form>
    </div>
  );
}

function AutomationsTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Rule[]>([]);
  const load = useCallback(() => api<Rule[]>('GET', `/v1/projects/${project}/automations`).then(setItems).catch(fail), [project, fail]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (rule: Rule) => {
    try {
      await api('POST', `/v1/automations/${rule.id}/${rule.enabled ? 'disable' : 'enable'}`);
      toast('success', fr.admin.toggled);
      await load();
    } catch (error) { fail(error); }
  };
  return items.length === 0 ? <EmptyState eyebrow={fr.admin.automations} title={fr.admin.empty} /> : (
    <Table>
      <thead><tr><Th>{fr.config.name}</Th><Th>{fr.admin.trigger}</Th><Th>ATQL</Th><Th>{fr.admin.active}</Th></tr></thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <Td>{r.name}</Td><Td mono>{r.trigger}</Td><Td mono>{r.condition || '—'}</Td>
            <Td><Btn size="sm" variant="ghost" onClick={() => toggle(r)}>{r.enabled ? fr.admin.disable : fr.admin.enable}</Btn></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function PluginsTab() {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<PluginEntry[]>([]);
  const load = useCallback(() => api<PluginEntry[]>('GET', '/v1/plugins').then(setItems).catch(fail), [fail]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (p: PluginEntry) => {
    try {
      await api('POST', `/v1/plugins/${p.id}/${p.enabled ? 'disable' : 'enable'}`);
      toast('success', fr.admin.toggled);
      await load();
    } catch (error) { fail(error); }
  };
  return items.length === 0 ? <EmptyState eyebrow={fr.admin.plugins} title={fr.admin.empty} /> : (
    <Table>
      <thead><tr><Th>{fr.config.name}</Th><Th>{fr.artifact.version}</Th><Th>Permissions</Th><Th>{fr.admin.active}</Th></tr></thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}><Td>{p.name} <span className="ath-mono">{p.id}</span></Td><Td mono>{p.version}</Td><Td mono>{p.permissions.join(', ') || '—'}</Td>
            <Td><Btn size="sm" variant="ghost" onClick={() => toggle(p)}>{p.enabled ? fr.admin.disable : fr.admin.enable}</Btn></Td></tr>
        ))}
      </tbody>
    </Table>
  );
}

function BaselinesTab({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [items, setItems] = useState<Baseline[]>([]);
  const [name, setName] = useState('');
  const load = useCallback(() => api<Baseline[]>('GET', `/v1/projects/${project}/baselines`).then(setItems).catch(fail), [project, fail]);
  useEffect(() => { void load(); }, [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `/v1/projects/${project}/baselines`, { name });
      toast('success', fr.admin.createdBaseline(name));
      setName('');
      await load();
    } catch (error) { fail(error); }
  };
  return (
    <div className="ath-stack">
      {items.length === 0 ? <EmptyState eyebrow={fr.admin.baselines} title={fr.admin.empty} /> : (
        <Table>
          <thead><tr><Th>{fr.config.name}</Th><Th>{fr.artifact.commit}</Th><Th>{fr.artifact.date}</Th></tr></thead>
          <tbody>{items.map((b) => <tr key={b.name}><Td mono>{b.name}</Td><Td mono>{b.gitSha.slice(0, 8)}</Td><Td mono mute>{b.createdAt.slice(0, 16).replace('T', ' ')}</Td></tr>)}</tbody>
        </Table>
      )}
      <form className="ath-toolbar" onSubmit={create}>
        <Field label={fr.admin.baselineName} value={name} onChange={(e) => setName(e.target.value)} mono />
        <Btn type="submit" disabled={!name}>{fr.admin.create}</Btn>
      </form>
    </div>
  );
}

export function AdminPage({ session }: { session: Session }) {
  const { project } = useParams();
  const [tab, setTab] = useState('webhooks');
  if (!session.user?.roles.includes('athena-admin')) return <><PageHeader eyebrow={fr.admin.eyebrow} title={`${fr.admin.title} · ${project}`} /><p className="ath-field__error">{fr.config.adminOnly}</p></>;
  return (
    <>
      <PageHeader eyebrow={fr.admin.eyebrow} title={`${fr.admin.title} · ${project}`} />
      <Tabs
        tabs={[{ id: 'webhooks', label: fr.admin.webhooks }, { id: 'automations', label: fr.admin.automations }, { id: 'plugins', label: fr.admin.plugins }, { id: 'baselines', label: fr.admin.baselines }]}
        active={tab} onChange={setTab}
      />
      <div role="tabpanel" className="ath-stack">
        {tab === 'webhooks' && <WebhooksTab />}
        {tab === 'automations' && <AutomationsTab project={project!} />}
        {tab === 'plugins' && <PluginsTab />}
        {tab === 'baselines' && <BaselinesTab project={project!} />}
      </div>
    </>
  );
}

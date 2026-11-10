/** Panneaux des Paramètres du projet (T-0120) : automatisations, baselines ; et les webhooks de l'Administration. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Card, EmptyState, Field, StatusPill, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Webhook { id: string; url: string; eventTypes: string[]; active: boolean }
interface Rule { id: string; name: string; enabled: boolean; trigger: string; condition: string }

/** Webhooks de l'organisation : objet global, réglé dans l'Administration (T-0120). */
export function WebhooksTab() {
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
        <Btn icon="plus" type="submit" disabled={!url}>{fr.admin.create}</Btn>
      </form>
    </div>
  );
}

export function AutomationsTab({ project }: { project: string }) {
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

/** Création d'une baseline (administrateurs) ; la liste et la comparaison sont dans `BaselineCompare`. */
export function BaselineCreate({ project }: { project: string }) {
  const toast = useToast();
  const fail = useFailure();
  const [name, setName] = useState('');
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('POST', `/v1/projects/${project}/baselines`, { name });
      toast('success', fr.admin.createdBaseline(name));
      setName('');
    } catch (error) { fail(error); }
  };
  return (
    <form className="ath-toolbar" onSubmit={create}>
      <Field label={fr.admin.baselineName} value={name} onChange={(e) => setName(e.target.value)} mono />
      <Btn icon="plus" type="submit" disabled={!name}>{fr.admin.create}</Btn>
    </form>
  );
}

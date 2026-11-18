import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Btn, Field, Select, Table, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { fr } from '../i18n';
import { formatDate } from '../lib/dates';
import { useConfirm } from './ConfirmDialog';

interface Token { id: string; name: string; scope: 'read' | 'write'; prefix: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null }

/** Jetons d'accès personnels (profil) : création avec expiration obligatoire, valeur montrée une seule fois, révocation. */
export function AccessTokens() {
  const t = fr.tokens;
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Token[]>([]);
  const [form, setForm] = useState({ name: '', scope: 'read', days: '90' });
  const [created, setCreated] = useState<string | null>(null);
  const load = useCallback(() => { api<Token[]>('GET', '/v1/me/tokens').then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([])); }, []);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ token: string }>('POST', '/v1/me/tokens', { name: form.name.trim(), scope: form.scope, expiresInDays: Number(form.days) });
      setCreated(r.token); setForm({ ...form, name: '' }); load();
    } catch (error) { toast('danger', error instanceof Error ? error.message : t.failed); }
  };
  const revoke = async (tok: Token) => {
    if (!(await confirm.ask({ title: t.revokeTitle(tok.name), body: t.revokeBody, confirm: t.revoke }))) return;
    try { await api('DELETE', `/v1/me/tokens/${tok.id}`); toast('success', t.revoked); load(); } catch (error) { toast('danger', error instanceof Error ? error.message : t.failed); }
  };

  return (
    <section aria-label={t.title} className="ath-stack">
      {confirm.dialog}
      <h2 className="ath-section-title">{t.title}</h2>
      <p>{t.help}</p>
      <form className="ath-toolbar" onSubmit={(e) => void create(e)} aria-label={t.create}>
        <Field label={t.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label className="ath-notify__pref">
          {t.scope}
          <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="read">{t.read}</option>
            <option value="write">{t.write}</option>
          </Select>
        </label>
        <Field label={t.days} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
        <Btn type="submit" size="sm" disabled={!form.name.trim() || !/^\d{1,3}$/.test(form.days) || Number(form.days) < 1 || Number(form.days) > 365}>{t.create}</Btn>
      </form>
      {created && (
        <div role="status" className="ath-notice">
          <p>{t.once}</p>
          <p><code className="ath-mono" aria-label={t.value}>{created}</code></p>
          <Btn size="sm" variant="ghost" onClick={() => setCreated(null)}>{t.hide}</Btn>
        </div>
      )}
      {list.length === 0 ? <p>{t.none}</p> : (
        <Table caption={t.caption(list.length)}>
          <thead><tr><Th>{t.name}</Th><Th>{t.prefix}</Th><Th>{t.scope}</Th><Th>{t.expires}</Th><Th>{t.lastUsed}</Th><Th>{t.actions}</Th></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id}>
              <Td>{x.name}</Td><Td mono>{x.prefix}…</Td><Td>{x.scope === 'read' ? t.read : t.write}</Td>
              <Td>{x.revokedAt ? t.revokedState : formatDate(x.expiresAt)}</Td><Td>{x.lastUsedAt ? formatDate(x.lastUsedAt) : t.never}</Td>
              <Td>{!x.revokedAt && <Btn size="sm" variant="ghost" aria-label={`${t.revoke} ${x.name}`} onClick={() => void revoke(x)}>{t.revoke}</Btn>}</Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </section>
  );
}

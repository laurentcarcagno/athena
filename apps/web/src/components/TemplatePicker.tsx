import { useState } from 'react';
import { Btn, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { useConfirm } from './ConfirmDialog';

export interface ProposedTemplate {
  key: string; name: string; description: string; builtin: boolean; natures: string[]; projectRoles: string[];
  tabs: Array<{ name: string; widgets: unknown[] }>;
}
interface ApplyResult { mode: 'add' | 'replace'; tabs: Array<{ id: string; title: string | null }>; truncated: number }

/**
 * « Partir d'un gabarit » (ADR-0010, P4) : les gabarits que la personne peut utiliser pour ce tableau de bord (ses rôles, la nature du projet, son rôle
 * dans le projet), avec leurs onglets. « Ajouter » pose leurs onglets à côté des siens ; « Remplacer » refait tout le tableau de bord. C'est une copie :
 * ensuite, tout se modifie comme un tableau de bord ordinaire.
 */
export function TemplatePicker({ scopeQuery, onApplied }: { scopeQuery: string; onApplied: (firstTab: string | undefined) => void }) {
  const t = fr.templates;
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ProposedTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const q = scopeQuery ? `?${scopeQuery}` : '';

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && list === null) api<{ templates: ProposedTemplate[] }>('GET', `/v1/me/dashboard/templates${q}`).then((r) => setList(Array.isArray(r?.templates) ? r.templates : [])).catch((e) => { setList([]); fail(e); });
  };
  const apply = async (tpl: ProposedTemplate, mode: 'add' | 'replace') => {
    if (mode === 'replace' && !(await confirm.ask({ title: t.replaceTitle(tpl.name), body: t.replaceBody, confirm: t.replace }))) return;
    setBusy(true);
    try {
      const r = await api<ApplyResult>('POST', `/v1/me/dashboard/templates/${tpl.key}/apply${q}`, { mode });
      toast('success', mode === 'add' ? t.added(r.tabs.length) : t.replaced);
      if (r.truncated > 0) toast('warning', t.truncated(r.truncated));
      setOpen(false);
      onApplied(r.tabs[0]?.id);
    } catch (error) { fail(error); } finally { setBusy(false); }
  };

  return (
    <section className="ath-stack" aria-label={t.title}>
      <div><Btn variant="ghost" size="sm" aria-expanded={open} onClick={toggle}>{t.start}</Btn></div>
      {open && (
        <div className="ath-stack ath-card" role="group" aria-label={t.title}>
          <p className="ath-field__hint">{t.help}</p>
          {list === null ? <p role="status">{fr.loading}</p> : list.length === 0 ? <p>{t.none}</p> : (
            <ul className="ath-stack">
              {list.map((tpl) => (
                <li key={tpl.key} className="ath-stack">
                  <div className="ath-row"><strong>{tpl.name}</strong>{tpl.builtin && <span className="ath-eyebrow">{t.builtin}</span>}</div>
                  {tpl.description && <p className="ath-field__hint">{tpl.description}</p>}
                  <p>{t.tabsSummary(tpl.tabs.map((x) => x.name))}</p>
                  <div className="ath-toolbar">
                    <Btn size="sm" variant="ghost" disabled={busy} aria-label={t.addNamed(tpl.name)} onClick={() => void apply(tpl, 'add')}>{t.add}</Btn>
                    <Btn size="sm" variant="ghost" disabled={busy} aria-label={t.replaceNamed(tpl.name)} onClick={() => void apply(tpl, 'replace')}>{t.replace}</Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {confirm.dialog}
    </section>
  );
}

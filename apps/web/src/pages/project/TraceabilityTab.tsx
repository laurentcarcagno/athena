import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Select, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../../api';
import { useConfirm } from '../../components/ConfirmDialog';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';

type Level = 'ok' | 'warning' | 'critical' | 'none';
interface Threshold { target: number; warning?: number }
interface Rule {
  key: string; scope: 'project' | 'organization'; name: string; fromTracker: string; linkType: string; direction: 'in' | 'out' | 'any'; minCount: number; statuses: string[]; threshold: Threshold;
  total: number; covered: number; rate: number | null; level: Level; suspect: number;
  gaps: Array<{ key: string; title: string }>;
  atql: { total: string; gaps: string; suspect: string };
  error: string | null;
}
interface LinkType { key: string; outwardLabel: string }

const SHOWN_GAPS = 10;

/** Adresse de l'écran Tracker filtré par la requête ATQL d'une règle (le tracker est déjà dans l'adresse, le reste est le fragment `f`). */
export function listHref(project: string, tracker: string, atql: string): string {
  const fragment = atql.replace(new RegExp(`^tracker = ${tracker}( AND )?`), '');
  return `/p/${project}/t/${tracker}/tableau${fragment ? `?f=${encodeURIComponent(fragment)}` : ''}`;
}

/** Onglet Traçabilité : taux de respect de chaque règle de couverture, items en défaut et items à lien suspect. */
export function TraceabilityTab({ session, tabs }: { session: Session; tabs?: ReactNode }) {
  const { project } = useParams();
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const admin = session.user?.roles.includes('athena-admin') ?? false;
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [types, setTypes] = useState<LinkType[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const t = fr.traceability;

  const load = useCallback(() => { api<Rule[]>('GET', `/v1/projects/${project}/coverage`).then(setRules).catch(fail); }, [project, fail]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Array<{ key: string }>>('GET', `/v1/projects/${project}/trackers`).then((r) => setTrackers(Array.isArray(r) ? r.map((x) => x.key) : [])).catch(() => setTrackers([]));
    api<LinkType[]>('GET', `/v1/projects/${project}/link-types`).then((r) => setTypes(Array.isArray(r) ? r : [])).catch(() => setTypes([]));
  }, [project]);

  const remove = async (rule: Rule) => {
    if (!(await confirm.ask({ title: t.deleteTitle(rule.name), body: t.deleteBody, confirm: fr.confirm.delete }))) return;
    const path = rule.scope === 'organization' ? `/v1/coverage-rules/${rule.key}` : `/v1/projects/${project}/coverage-rules/${rule.key}`;
    try { await api('DELETE', path); toast('success', t.deleted); load(); } catch (error) { fail(error); }
  };

  return (
    <>
      {confirm.dialog}
      <PageHeader title={t.title} actions={admin ? <Btn onClick={() => { setEditing(null); setAdding(true); }}>{t.addRule}</Btn> : undefined} />
      {tabs}
      {(adding || editing) && <RuleForm key={editing?.key ?? 'new'} project={String(project)} trackers={trackers} types={types} editing={editing} onCancel={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { toast('success', editing ? t.saved : t.created); setAdding(false); setEditing(null); load(); }} />}
      {rules === null ? <p role="status">{fr.loading}</p> : rules.length === 0 ? (
        <EmptyState eyebrow={t.title} title={t.empty} />
      ) : rules.map((r) => (
        <section key={`${r.scope}-${r.key}`} className="ath-card ath-rule ath-stack" aria-labelledby={`rule-${r.key}`}>
          <h2 id={`rule-${r.key}`} className="ath-section-title">{r.name} <Tag variant="ghost">{t.scopes[r.scope]}</Tag></h2>
          <p className="ath-eyebrow">{t.sentence(r.fromTracker, r.linkType, r.minCount, r.direction, r.statuses)}</p>
          {r.error ? <p role="alert">{r.error}</p> : (
            <>
              <p>
                <span className="ath-mono">{r.rate === null ? '—' : `${r.rate} %`}</span>{' '}
                <Tag variant={r.level === 'ok' ? 'solid' : r.level === 'critical' ? 'accent' : 'default'}>{t.levels[r.level]}</Tag>{' '}
                <span className="ath-eyebrow">{t.target(r.threshold.target, r.threshold.warning)}</span>
              </p>
              <ul className="ath-rule__numbers">
                <li><Link className="ath-link ath-mono" to={listHref(String(project), r.fromTracker, r.atql.total)}>{t.nTotal(r.total)}</Link></li>
                <li>{t.nCovered(r.covered)}</li>
                <li><Link className="ath-link ath-mono" to={listHref(String(project), r.fromTracker, r.atql.gaps)}>{t.nGaps(r.total - r.covered)}</Link></li>
                <li><Link className="ath-link ath-mono" to={listHref(String(project), r.fromTracker, r.atql.suspect)}>{t.nSuspect(r.suspect)}</Link></li>
              </ul>
              {r.gaps.length > 0 && (
                <Table>
                  <caption className="ath-table__caption">{t.gapsCaption(r.name)}</caption>
                  <thead><tr><Th>{t.item}</Th><Th>{t.itemTitle}</Th></tr></thead>
                  <tbody>
                    {r.gaps.slice(0, SHOWN_GAPS).map((g) => (
                      <tr key={g.key}><Td><Link className="ath-link ath-mono" to={`/p/${project}/a/${g.key}`}>{g.key}</Link></Td><Td>{g.title}</Td></tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {r.total - r.covered > Math.min(SHOWN_GAPS, r.gaps.length) && <p className="ath-eyebrow">{t.moreGaps(r.total - r.covered - Math.min(SHOWN_GAPS, r.gaps.length))}</p>}
            </>
          )}
          {admin && <div className="ath-toolbar"><Btn variant="ghost" size="sm" onClick={() => { setAdding(false); setEditing(r); }}>{t.edit}</Btn><Btn variant="ghost" size="sm" onClick={() => void remove(r)}>{fr.confirm.delete}</Btn></div>}
        </section>
      ))}
    </>
  );
}

function RuleForm({ project, trackers, types, editing, onCancel, onSaved }: { project: string; trackers: string[]; types: LinkType[]; editing: Rule | null; onCancel: () => void; onSaved: () => void }) {
  const fail = useFailure();
  const t = fr.traceability;
  const [form, setForm] = useState(editing
    ? { key: editing.key, name: editing.name, fromTracker: editing.fromTracker, linkType: editing.linkType, direction: editing.direction as string, minCount: String(editing.minCount), statuses: editing.statuses.join(', '), target: String(editing.threshold.target), warning: editing.threshold.warning === undefined ? '' : String(editing.threshold.warning), scope: editing.scope as string }
    : { key: '', name: '', fromTracker: trackers[0] ?? '', linkType: types.find((x) => x.key === 'verifies')?.key ?? types[0]?.key ?? 'verifies', direction: 'any', minCount: '1', statuses: '', target: '100', warning: '', scope: 'project' });
  const set = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      key: form.key, name: form.name, fromTracker: form.fromTracker, linkType: form.linkType, direction: form.direction, minCount: Number(form.minCount),
      statuses: form.statuses.split(',').map((s) => s.trim()).filter(Boolean),
      threshold: { target: Number(form.target), ...(form.warning === '' ? {} : { warning: Number(form.warning) }) },
    };
    const base = form.scope === 'organization' ? '/v1/coverage-rules' : `/v1/projects/${project}/coverage-rules`;
    try {
      if (editing) { const { key, ...rest } = body; await api('PUT', `${base}/${key}`, rest); } else await api('POST', base, body);
      onSaved();
    } catch (error) { fail(error); }
  };
  const field = (id: string, label: string, control: JSX.Element) => <div className="ath-field"><label className="ath-field__label" htmlFor={id}>{label}</label>{control}</div>;
  return (
    <form className="ath-card ath-rule ath-stack" onSubmit={(e) => void submit(e)} aria-label={editing ? t.editRule(editing.name) : t.addRule}>
      <div className="ath-toolbar">
        {field('cr-key', t.ruleKey, <input id="cr-key" className="ath-input ath-mono" required readOnly={editing !== null} pattern="[a-z][a-z0-9_\-]{0,39}" value={form.key} onChange={(e) => set('key', e.target.value)} />)}
        {field('cr-name', t.ruleName, <input id="cr-name" className="ath-input" required maxLength={200} value={form.name} onChange={(e) => set('name', e.target.value)} />)}
        {field('cr-scope', t.scope, <Select id="cr-scope" disabled={editing !== null} value={form.scope} onChange={(e) => set('scope', e.target.value)}><option value="project">{t.scopes.project}</option><option value="organization">{t.scopes.organization}</option></Select>)}
      </div>
      <div className="ath-toolbar">
        {field('cr-tracker', t.fromTracker, <Select id="cr-tracker" value={form.fromTracker} onChange={(e) => set('fromTracker', e.target.value)}>{trackers.map((k) => <option key={k} value={k}>{k}</option>)}</Select>)}
        {field('cr-type', t.linkType, <Select id="cr-type" value={form.linkType} onChange={(e) => set('linkType', e.target.value)}>{types.map((x) => <option key={x.key} value={x.key}>{x.outwardLabel} ({x.key})</option>)}</Select>)}
        {field('cr-direction', t.direction, <Select id="cr-direction" value={form.direction} onChange={(e) => set('direction', e.target.value)}>{(['any', 'in', 'out'] as const).map((d) => <option key={d} value={d}>{t.directions[d]}</option>)}</Select>)}
        {field('cr-min', t.minCount, <input id="cr-min" className="ath-input ath-mono" type="number" min={1} max={100} required value={form.minCount} onChange={(e) => set('minCount', e.target.value)} />)}
      </div>
      <div className="ath-toolbar">
        {field('cr-statuses', t.statuses, <input id="cr-statuses" className="ath-input ath-mono" value={form.statuses} placeholder="validated, approved" onChange={(e) => set('statuses', e.target.value)} />)}
        {field('cr-target', t.targetLabel, <input id="cr-target" className="ath-input ath-mono" type="number" min={0} max={100} step="0.1" required value={form.target} onChange={(e) => set('target', e.target.value)} />)}
        {field('cr-warning', t.warningLabel, <input id="cr-warning" className="ath-input ath-mono" type="number" min={0} max={100} step="0.1" value={form.warning} onChange={(e) => set('warning', e.target.value)} />)}
      </div>
      <div className="ath-toolbar"><Btn icon="save" type="submit">{editing ? t.saveRule : t.createRule}</Btn><Btn icon="close" type="button" variant="ghost" onClick={onCancel}>{fr.confirm.cancel}</Btn></div>
    </form>
  );
}

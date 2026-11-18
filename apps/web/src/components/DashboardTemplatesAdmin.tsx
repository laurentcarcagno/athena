import { useCallback, useEffect, useState } from 'react';
import { Btn, Card, Checkbox, DashCard, DashGrid, EmptyState, Select, Table, Tabs, Td, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';
import { withBoxes } from '../lib/grid';
import { useConfirm } from './ConfirmDialog';
import { Body } from './Dashboard';
import { DashboardEditor, type EditorTarget } from './DashboardEditor';
import { sizeOf, widgetTitle, type CatalogEntry, type Placed, type SavedSearch, type Widget } from './dashboard-model';

/**
 * Organisation › Gabarits › Tableaux de bord (lot 27, ADR-0010, T-0259 à T-0261) : liste filtrable des gabarits livrés et d'organisation, masquage,
 * duplication, gabarits par défaut par type et par rôle ; éditeur à onglets fondé sur l'éditeur de grille d'« Organiser » ; aperçu « voir comme ».
 */
const t = fr.templateAdmin;
const TYPES: EditorTarget[] = ['home', 'project', 'progress', 'portfolio'];
const ROLES = ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm', 'athena-manager', 'athena-finance', 'athena-qa', 'athena-team-member'];
const NATURES = ['space-software', 'space-project', 'defense-software', 'armament', 'generic'];
const PROJECT_ROLES = ['manager', 'member', 'reader'];
const roleName = (r: string) => fr.steer.roleNames[r] ?? r;

interface Tpl {
  key: string; type: EditorTarget; name: string; description: string; roles: string[]; natures: string[]; projectRoles: string[];
  tabs: Array<{ name: string; widgets: Widget[] }>; builtin: boolean; hidden: boolean; derivedFrom: string | null;
}
interface DefaultRow { type: EditorTarget; role: string; templateKey: string }
interface Draft { key?: string; type: EditorTarget; name: string; description: string; roles: string[]; natures: string[]; projectRoles: string[]; tabs: Array<{ name: string; widgets: Placed[] }> }

/** Carte de gabarit dans l'éditeur : son genre, sa recherche et sa répétition, sans donnée réelle. */
function CardSketch({ w }: { w: Widget }) {
  return (
    <div className="ath-stack">
      <p className="ath-eyebrow">{fr.home.kinds[w.kind] ?? w.kind}</p>
      {w.query !== undefined && <p className="ath-mono ath-clip" title={w.query}>{w.query || '∅'}</p>}
      {w.field && <p className="ath-field__hint">{t.chartBy(w.field, w.form ?? '')}</p>}
      {w.repeat && <p className="ath-field__hint">{fr.home.repeatOption[w.repeat]}</p>}
    </div>
  );
}

/** Gabarit résolu (aperçu) : les onglets et leurs cartes, avec les vraies données de l'administrateur, en lecture seule. */
function ResolvedView({ tabs, project, portfolio }: { tabs: Array<{ name: string; widgets: Widget[] }>; project?: string; portfolio?: string }) {
  const [active, setActive] = useState('0');
  const tab = tabs[Number(active)] ?? tabs[0];
  return (
    <div className="ath-stack">
      <Tabs tabs={tabs.map((x, i) => ({ id: String(i), label: x.name }))} active={active} onChange={setActive} />
      {tab && tab.widgets.length === 0 ? <p>{t.emptyTab}</p> : (
        <DashGrid>{(withBoxes(tab?.widgets ?? []) as Placed[]).map((w) => (
          <DashCard key={w.id} size={sizeOf(w)} box={{ x: w.x, y: w.y, w: w.w, h: w.h }} title={widgetTitle(w)} role="group" aria-label={widgetTitle(w)}>
            <Body widget={w} objects={false} project={project} portfolio={portfolio} />
          </DashCard>
        ))}</DashGrid>
      )}
    </div>
  );
}

export function DashboardTemplatesAdmin() {
  const fail = useFailure();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{ templates: Tpl[]; defaults: DefaultRow[] } | null>(null);
  const [type, setType] = useState('');
  const [role, setRole] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(0);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [views, setViews] = useState<SavedSearch[]>([]);
  const [tabName, setTabName] = useState('');
  const [defaultFor, setDefaultFor] = useState<{ key: string; role: string } | null>(null);
  const [preview, setPreview] = useState<{ key: string; type: EditorTarget; project: string; portfolio: string; result: { scope: string; tabs: Array<{ name: string; widgets: Widget[] }> } | null } | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [portfolios, setPortfolios] = useState<string[]>([]);

  const load = useCallback(async () => {
    try { const r = await api<{ templates: Tpl[]; defaults: DefaultRow[] }>('GET', '/v1/dashboard-templates'); setData({ templates: Array.isArray(r?.templates) ? r.templates : [], defaults: Array.isArray(r?.defaults) ? r.defaults : [] }); } catch (error) { setData({ templates: [], defaults: [] }); fail(error); }
  }, [fail]);
  useEffect(() => { void load(); }, [load]);
  // Le catalogue de l'éditeur : les genres permis à tous les rôles visés, pour ce type.
  useEffect(() => {
    if (!draft || draft.roles.length === 0) { setCatalog([]); return; }
    api<{ kinds: CatalogEntry[] }>('GET', `/v1/dashboard-templates/catalog?type=${draft.type}&roles=${draft.roles.join(',')}`).then((r) => setCatalog(Array.isArray(r?.kinds) ? r.kinds : [])).catch(() => setCatalog([]));
  }, [draft?.type, draft?.roles.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (draft) api<SavedSearch[]>('GET', '/v1/searches').then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => setViews([])); }, [draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null) return <p role="status">{fr.loading}</p>;
  const shown = data.templates.filter((x) => (!type || x.type === type) && (!role || x.roles.includes(role)));
  const nameOf = (key: string) => data.templates.find((x) => x.key === key)?.name ?? key;

  const toDraft = (x: Tpl): Draft => ({ key: x.key, type: x.type, name: x.name, description: x.description, roles: x.roles, natures: x.natures, projectRoles: x.projectRoles, tabs: x.tabs.map((tb) => ({ name: tb.name, widgets: withBoxes(tb.widgets) as Placed[] })) });
  const open = (x: Tpl) => { setDraft(toDraft(x)); setActive(0); setPreview(null); };
  const create = () => { setDraft({ type: 'home', name: '', description: '', roles: [], natures: [], projectRoles: [], tabs: [{ name: t.firstTab, widgets: [] }] }); setActive(0); setPreview(null); };
  const patch = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setWidgets = (widgets: Placed[]) => setDraft((d) => (d ? { ...d, tabs: d.tabs.map((tb, i) => (i === active ? { ...tb, widgets } : tb)) } : d));

  const save = async () => {
    if (!draft) return;
    const body = {
      type: draft.type, name: draft.name.trim(), description: draft.description.trim(), roles: draft.roles,
      natures: draft.type === 'project' || draft.type === 'progress' ? draft.natures : [], projectRoles: draft.type === 'project' || draft.type === 'progress' ? draft.projectRoles : [],
      tabs: draft.tabs.map((tb) => ({ name: tb.name, widgets: tb.widgets.map(({ id, ...w }) => ({ id, ...w })) })),
    };
    try {
      await (draft.key ? api('PUT', `/v1/dashboard-templates/${draft.key}`, body) : api('POST', '/v1/dashboard-templates', body));
      toast('success', t.saved);
      setDraft(null);
      await load();
    } catch (error) { fail(error); }
  };
  const addTab = () => {
    const name = tabName.trim();
    if (!name || !draft) return;
    patch({ tabs: [...draft.tabs, { name, widgets: [] }] });
    setActive(draft.tabs.length);
    setTabName('');
  };
  const renameTab = (name: string) => draft && patch({ tabs: draft.tabs.map((tb, i) => (i === active ? { ...tb, name } : tb)) });
  const removeTab = () => { if (!draft || draft.tabs.length <= 1) return; patch({ tabs: draft.tabs.filter((_, i) => i !== active) }); setActive(0); };
  const moveTab = (delta: number) => {
    if (!draft) return;
    const to = active + delta;
    if (to < 0 || to >= draft.tabs.length) return;
    const tabs = [...draft.tabs];
    [tabs[active], tabs[to]] = [tabs[to]!, tabs[active]!];
    patch({ tabs });
    setActive(to);
  };
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast('success', done); await load(); } catch (error) { fail(error); } };
  const duplicate = (x: Tpl) => act(() => api('POST', `/v1/dashboard-templates/${x.key}/duplicate`, {}), t.duplicated);
  const hide = (x: Tpl) => act(() => api('PUT', `/v1/dashboard-templates/${x.key}/hidden`, { hidden: !x.hidden }), x.hidden ? t.shown : t.hidden);
  const remove = async (x: Tpl) => {
    if (!(await confirm.ask({ title: t.deleteTitle(x.name), body: t.deleteBody, confirm: t.delete }))) return;
    await act(() => api('DELETE', `/v1/dashboard-templates/${x.key}`), t.deleted);
  };
  const setDefault = () => defaultFor && act(async () => { const x = data.templates.find((y) => y.key === defaultFor.key)!; await api('PUT', `/v1/dashboard-templates/defaults/${x.type}/${defaultFor.role}`, { template: x.key }); setDefaultFor(null); }, t.defaultSet);
  const clearDefault = (d: DefaultRow) => act(() => api('DELETE', `/v1/dashboard-templates/defaults/${d.type}/${d.role}`), t.defaultCleared);

  const openPreview = async (x: Tpl) => {
    setDraft(null);
    setPreview({ key: x.key, type: x.type, project: '', portfolio: '', result: null });
    if (x.type === 'project' || x.type === 'progress') api<Array<{ key: string }>>('GET', '/v1/projects').then((r) => setProjects(Array.isArray(r) ? r.map((p) => p.key) : [])).catch(() => setProjects([]));
    if (x.type === 'portfolio') api<Array<{ key: string }>>('GET', '/v1/portfolios').then((r) => setPortfolios(Array.isArray(r) ? r.map((p) => p.key) : [])).catch(() => setPortfolios([]));
  };
  const runPreview = async () => {
    if (!preview) return;
    try {
      const result = await api<{ scope: string; tabs: Array<{ name: string; widgets: Widget[] }> }>('POST', `/v1/dashboard-templates/${preview.key}/preview`, { ...(preview.project ? { project: preview.project } : {}), ...(preview.portfolio ? { portfolio: preview.portfolio } : {}) });
      setPreview({ ...preview, result });
    } catch (error) { fail(error); }
  };

  const editorTarget = draft?.type;
  const current = draft?.tabs[active];
  return (
    <div className="ath-stack">
      <p className="ath-eyebrow">{t.help}</p>
      <div className="ath-toolbar">
        <label className="ath-field">{t.filterType}
          <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">{t.all}</option>{TYPES.map((x) => <option key={x} value={x}>{t.types[x]}</option>)}</Select>
        </label>
        <label className="ath-field">{t.filterRole}
          <Select value={role} onChange={(e) => setRole(e.target.value)}><option value="">{t.all}</option>{ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</Select>
        </label>
        <Btn size="sm" onClick={create}>{t.create}</Btn>
      </div>
      {shown.length === 0 ? <EmptyState eyebrow={t.title} title={t.none} /> : (
        <Table caption={t.caption(shown.length)}>
          <thead><tr><Th>{t.name}</Th><Th>{t.type}</Th><Th>{t.roles}</Th><Th>{t.target}</Th><Th>{t.origin}</Th><Th>{t.actions}</Th></tr></thead>
          <tbody>{shown.map((x) => {
            const defaults = data.defaults.filter((d) => d.templateKey === x.key);
            return (
              <tr key={x.key}>
                <Td><strong>{x.name}</strong>{x.description && <><br /><span className="ath-field__hint">{x.description}</span></>}<br /><span className="ath-mono">{x.key}</span> · {t.tabsCount(x.tabs.length)}</Td>
                <Td>{t.types[x.type]}</Td>
                <Td>{x.roles.map(roleName).join(', ')}</Td>
                <Td>{[...x.natures.map((n) => t.natures[n] ?? n), ...x.projectRoles.map((r) => t.projectRoles[r] ?? r)].join(', ') || t.everywhere}</Td>
                <Td>{x.builtin ? t.builtin : t.organization}{x.hidden ? ` · ${t.hiddenState}` : ''}{x.derivedFrom ? ` · ${t.derived(nameOf(x.derivedFrom))}` : ''}{defaults.length > 0 ? ` · ${t.defaultOf(defaults.map((d) => roleName(d.role)).join(', '))}` : ''}</Td>
                <Td>
                  <span className="ath-toolbar">
                    {!x.builtin && <Btn size="sm" variant="ghost" aria-label={`${t.edit} ${x.name}`} onClick={() => open(x)}>{t.edit}</Btn>}
                    <Btn size="sm" variant="ghost" aria-label={`${t.preview} ${x.name}`} onClick={() => void openPreview(x)}>{t.preview}</Btn>
                    <Btn size="sm" variant="ghost" aria-label={`${t.duplicate} ${x.name}`} onClick={() => void duplicate(x)}>{t.duplicate}</Btn>
                    {x.builtin && <Btn size="sm" variant="ghost" aria-label={`${x.hidden ? t.show : t.hide} ${x.name}`} onClick={() => void hide(x)}>{x.hidden ? t.show : t.hide}</Btn>}
                    {!x.builtin && <Btn size="sm" variant="ghost" aria-label={`${t.delete} ${x.name}`} onClick={() => void remove(x)}>{t.delete}</Btn>}
                    {!x.hidden && <Btn size="sm" variant="ghost" aria-label={`${t.setDefault} ${x.name}`} onClick={() => setDefaultFor({ key: x.key, role: x.roles[0]! })}>{t.setDefault}</Btn>}
                  </span>
                </Td>
              </tr>
            );
          })}</tbody>
        </Table>
      )}

      {defaultFor && (
        <Card title={t.setDefaultTitle(nameOf(defaultFor.key))}>
          <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); void setDefault(); }}>
            <label className="ath-field">{t.defaultRole}
              <Select value={defaultFor.role} onChange={(e) => setDefaultFor({ ...defaultFor, role: e.target.value })}>
                {(data.templates.find((x) => x.key === defaultFor.key)?.roles ?? []).map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
              </Select>
            </label>
            <Btn size="sm" type="submit">{t.setDefaultDo}</Btn>
            <Btn size="sm" type="button" variant="ghost" onClick={() => setDefaultFor(null)}>{fr.home.cancel}</Btn>
          </form>
          <p className="ath-field__hint">{t.defaultHelp}</p>
        </Card>
      )}
      <Card title={t.defaultsTitle}>
        {data.defaults.length === 0 ? <p>{t.noDefault}</p> : (
          <ul className="ath-stack">{data.defaults.map((d) => (
            <li key={`${d.type}-${d.role}`} className="ath-row"><span>{t.defaultLine(t.types[d.type]!, roleName(d.role), nameOf(d.templateKey))}</span>
              <Btn size="sm" variant="ghost" aria-label={t.clearDefault(t.types[d.type]!, roleName(d.role))} onClick={() => void clearDefault(d)}>{t.remove}</Btn></li>
          ))}</ul>
        )}
      </Card>

      {preview && (
        <section className="ath-stack" aria-label={t.previewOf(nameOf(preview.key))}>
          <h2 className="ath-section-title">{t.previewOf(nameOf(preview.key))}</h2>
          <p className="ath-field__hint">{t.previewHelp}</p>
          <div className="ath-toolbar">
            {(preview.type === 'project' || preview.type === 'progress') && (
              <label className="ath-field">{t.previewProject}
                <Select value={preview.project} onChange={(e) => setPreview({ ...preview, project: e.target.value, result: null })}><option value="">{t.choose}</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
              </label>
            )}
            {preview.type === 'portfolio' && (
              <label className="ath-field">{t.previewPortfolio}
                <Select value={preview.portfolio} onChange={(e) => setPreview({ ...preview, portfolio: e.target.value, result: null })}><option value="">{t.choose}</option>{portfolios.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
              </label>
            )}
            <Btn size="sm" disabled={(preview.type === 'project' || preview.type === 'progress') ? !preview.project : preview.type === 'portfolio' ? !preview.portfolio : false} onClick={() => void runPreview()}>{t.previewRun}</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setPreview(null)}>{t.close}</Btn>
          </div>
          {preview.result && <ResolvedView tabs={preview.result.tabs} project={preview.project || undefined} portfolio={preview.portfolio || undefined} />}
        </section>
      )}

      {draft && editorTarget && current && (
        <section className="ath-stack" aria-label={draft.key ? t.editing(draft.name) : t.creating}>
          <h2 className="ath-section-title">{draft.key ? t.editing(draft.name) : t.creating}</h2>
          <div className="ath-grid-2">
            <label className="ath-field">{t.name}<input className="ath-input" value={draft.name} maxLength={100} onChange={(e) => patch({ name: e.target.value })} /></label>
            <label className="ath-field">{t.type}
              <Select value={draft.type} disabled={!!draft.key} onChange={(e) => patch({ type: e.target.value as EditorTarget, tabs: draft.tabs.map((tb) => ({ ...tb, widgets: [] })) })}>{TYPES.map((x) => <option key={x} value={x}>{t.types[x]}</option>)}</Select>
            </label>
          </div>
          <label className="ath-field">{t.description}<input className="ath-input" value={draft.description} maxLength={500} onChange={(e) => patch({ description: e.target.value })} /></label>
          <fieldset className="ath-field"><legend>{t.roles}</legend>
            <div className="ath-toolbar">{ROLES.map((r) => <label key={r} className="ath-row"><Checkbox checked={draft.roles.includes(r)} onChange={() => patch({ roles: toggle(draft.roles, r) })} /> {roleName(r)}</label>)}</div>
            <p className="ath-field__hint">{t.rolesHelp}</p>
          </fieldset>
          {(draft.type === 'project' || draft.type === 'progress') && (
            <>
              <fieldset className="ath-field"><legend>{t.natureTitle}</legend>
                <div className="ath-toolbar">{NATURES.map((n) => <label key={n} className="ath-row"><Checkbox checked={draft.natures.includes(n)} onChange={() => patch({ natures: toggle(draft.natures, n) })} /> {t.natures[n]!}</label>)}</div>
                <p className="ath-field__hint">{t.natureHelp}</p>
              </fieldset>
              <fieldset className="ath-field"><legend>{t.projectRoleTitle}</legend>
                <div className="ath-toolbar">{PROJECT_ROLES.map((r) => <label key={r} className="ath-row"><Checkbox checked={draft.projectRoles.includes(r)} onChange={() => patch({ projectRoles: toggle(draft.projectRoles, r) })} /> {t.projectRoles[r]!}</label>)}</div>
              </fieldset>
            </>
          )}
          <div className="ath-stack" role="group" aria-label={t.tabsTitle}>
            <Tabs tabs={draft.tabs.map((tb, i) => ({ id: String(i), label: tb.name }))} active={String(active)} onChange={(id) => setActive(Number(id))} />
            <div className="ath-toolbar">
              <label className="ath-field">{t.tabNameField}<input className="ath-input" value={current.name} maxLength={60} onChange={(e) => renameTab(e.target.value)} /></label>
              <Btn size="sm" variant="ghost" disabled={active === 0} onClick={() => moveTab(-1)}>{t.tabLeft}</Btn>
              <Btn size="sm" variant="ghost" disabled={active === draft.tabs.length - 1} onClick={() => moveTab(1)}>{t.tabRight}</Btn>
              <Btn size="sm" variant="ghost" disabled={draft.tabs.length <= 1} onClick={removeTab}>{t.tabRemove}</Btn>
            </div>
            <form className="ath-toolbar" onSubmit={(e) => { e.preventDefault(); addTab(); }}>
              <label className="ath-field">{t.tabNew}<input className="ath-input" value={tabName} maxLength={60} onChange={(e) => setTabName(e.target.value)} /></label>
              <Btn size="sm" type="submit" disabled={!tabName.trim() || draft.tabs.length >= 9}>{t.tabAdd}</Btn>
            </form>
          </div>
          {draft.roles.length === 0 ? <p className="ath-notice">{t.pickRoles}</p> : (
            <DashboardEditor key={`${draft.type}-${active}`} widgets={current.widgets} onChange={setWidgets} catalog={catalog} views={views} builtin={[]}
              renderBody={(w) => <CardSketch w={w} />} template={editorTarget} />
          )}
          <div className="ath-toolbar">
            <Btn onClick={() => void save()} disabled={!draft.name.trim() || draft.roles.length === 0}>{t.save}</Btn>
            <Btn variant="ghost" onClick={() => setDraft(null)}>{fr.home.cancel}</Btn>
          </div>
        </section>
      )}
      {confirm.dialog}
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card, Checkbox, Chart, Field, Select, Table, Td, Textarea, Th, useToast } from '@athena/ui';
import { api } from '../api';
import { useFailure } from '../hooks';
import { fr } from '../i18n';

interface Criterion { key: string; label: string; weight: number; scaleMin: number; scaleMax: number; direction: 'higher' | 'lower' }
interface Ranked { key: string; project: string; title: string; score: number | null; completeness: number; incomplete: boolean; contributions: Array<{ criterion: string; points: number }>; converted: 'converted' | 'refused' | null }
interface Ranking { model: { version: number; criteria: Criterion[] } | null; requests: Ranked[] }
interface ScenarioItem { id: string; name: string; author: string; changeCount: number }
interface Evaluation {
  scenario: { name: string };
  result: {
    shifts: Array<{ ticket: string; shiftDays: number; impacts: Array<{ key: string; project: string; shiftDays: number }> }>;
    capacity: Array<{ team: string; project: string; periods: Array<{ period: string; beforeLevel: number; afterLevel: number }> }>;
    budget: Array<{ project: string; varianceBefore: number; varianceAfter: number; amount: number }>;
  };
}
interface Ev { project: string; name: string; bac: number; pv: number; ev: number; ac: number; cpi: number | null; spi: number | null; quadrant: string }

const euros = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} €`;

/** Priorisation des demandes, scénarios et valeur acquise d'un portefeuille (lot 25, B41). Ne se montre que si la fonctionnalité Demandes est active. */
export function PrioritizationPanel({ portfolio, canEdit, canSeeFinance }: { portfolio: string; canEdit: boolean; canSeeFinance: boolean }) {
  const t = fr.prio;
  const fail = useFailure();
  const toast = useToast();
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [ev, setEv] = useState<Ev[] | null>(null);
  const [score, setScore] = useState({ ticket: '', criterion: '', value: '' });
  const [shift, setShift] = useState({ name: '', ticket: '', days: '5' });
  const [model, setModel] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const [conv, setConv] = useState({ ticket: '', project: '', name: '', template: '' });
  const load = useCallback(() => {
    api<Ranking>('GET', `/v1/portfolios/${portfolio}/ranking`).then((r) => setRanking(r && Array.isArray(r.requests) ? r : null)).catch(() => setRanking(null));
    api<ScenarioItem[]>('GET', `/v1/portfolios/${portfolio}/scenarios`).then((r) => setScenarios(Array.isArray(r) ? r : [])).catch(() => setScenarios([]));
    if (canSeeFinance) api<{ rows: Ev[] }>('GET', `/v1/portfolios/${portfolio}/earned-value`).then((r) => setEv(Array.isArray(r?.rows) ? r.rows : null)).catch(() => setEv(null));
  }, [portfolio, canSeeFinance]);
  useEffect(load, [load]);
  if (!ranking) return null;

  const saveScore = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', `/v1/portfolios/${portfolio}/scores`, { ticket: score.ticket.trim(), criterion: score.criterion, value: Number(score.value.replace(',', '.')) }); setScore({ ...score, value: '' }); toast('success', t.scoreSaved); load(); } catch (error) { fail(error); }
  };
  const saveModel = async (e: FormEvent) => {
    e.preventDefault();
    // une ligne par critère : clé;libellé;poids;minimum;maximum;higher|lower (higher : plus c'est haut, mieux c'est)
    const criteria = model.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [key = '', label = '', weight = '', min = '', max = '', direction = 'higher'] = l.split(';').map((x) => x.trim());
      return { key, label, weight: Number(weight.replace(',', '.')), scaleMin: Number(min.replace(',', '.')), scaleMax: Number(max.replace(',', '.')), direction };
    });
    try { await api('POST', `/v1/portfolios/${portfolio}/scoring-model`, { criteria }); setModel(''); toast('success', t.modelSaved); load(); } catch (error) { fail(error); }
  };
  const convert = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('POST', `/v1/requests/${conv.ticket}/convert`, { project: conv.project.toUpperCase(), name: conv.name, ...(conv.template ? { template: conv.template } : {}) });
      setConv({ ticket: '', project: '', name: '', template: '' }); toast('success', t.converted); load();
    } catch (error) { fail(error); }
  };
  const refuse = async (key: string) => {
    const reason = window.prompt(t.refusePrompt(key)); // le motif est obligatoire : sans lui, l'API refuse
    if (reason === null) return;
    try { await api('POST', `/v1/requests/${key}/refuse`, { reason }); toast('success', t.refused); load(); } catch (error) { fail(error); }
  };
  const createScenario = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', `/v1/portfolios/${portfolio}/scenarios`, { name: shift.name, changes: [{ kind: 'shift_ticket', ticket: shift.ticket.trim(), shiftDays: Number(shift.days) }] }); setShift({ name: '', ticket: '', days: '5' }); toast('success', t.scenarioSaved); load(); } catch (error) { fail(error); }
  };
  const evaluate = async (id: string) => { try { setEvaluation(await api<Evaluation>('GET', `/v1/portfolios/${portfolio}/scenarios/${id}/evaluate`)); } catch (error) { fail(error); } };
  const chart = ranking.requests.filter((r) => r.score !== null && r.contributions.length > 0);

  return (
    <div className="ath-stack">
      <Card title={t.ranking} meta={ranking.model ? <span className="ath-mono">{t.version(ranking.model.version)}</span> : undefined}>
        <div className="ath-stack">
          {!ranking.model ? <p>{t.noModel}</p> : ranking.requests.length === 0 ? <p>{t.noRequest}</p> : (
            <Table caption={t.caption(ranking.requests.length)}>
              <thead><tr><Th>{t.rank}</Th><Th>{t.request}</Th><Th>{t.score}</Th><Th>{t.completeness}</Th><Th>{t.state}</Th>{canEdit && <Th>{t.actions}</Th>}</tr></thead>
              <tbody>{ranking.requests.map((r, i) => (
                <tr key={r.key}>
                  <Td mono>{r.score === null ? '—' : i + 1}</Td><Td><Link className="ath-link ath-mono" to={`/p/${r.project}/a/${r.key}`}>{r.key}</Link> {r.title}</Td><Td mono>{r.score === null ? t.notScored : r.score}</Td>
                  <Td mono>{r.completeness} %{r.incomplete ? ` · ${t.incomplete}` : ''}</Td><Td>{r.converted ? t.outcomes[r.converted] : t.open}</Td>
                  {canEdit && <Td>{r.converted ? null : <><Btn size="sm" variant="ghost" onClick={() => setConv({ ...conv, ticket: r.key })}>{t.convert}</Btn> <Btn size="sm" variant="ghost" onClick={() => void refuse(r.key)}>{t.refuse}</Btn></>}</Td>}
                </tr>
              ))}</tbody>
            </Table>
          )}
          {canEdit && ranking.model && (
            <form className="ath-toolbar" onSubmit={(e) => void saveScore(e)} aria-label={t.scoreForm}>
              <Field label={t.requestKey} mono value={score.ticket} onChange={(e) => setScore({ ...score, ticket: e.target.value })} required />
              <label className="ath-field__label" htmlFor="sc-criterion">{t.criterion}</label>
              <Select id="sc-criterion" value={score.criterion} onChange={(e) => setScore({ ...score, criterion: e.target.value })} required><option value="">—</option>{ranking.model.criteria.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.scaleMin} à {c.scaleMax})</option>)}</Select>
              <Field label={t.value} value={score.value} onChange={(e) => setScore({ ...score, value: e.target.value })} required />
              <Btn type="submit" size="sm" disabled={!score.ticket || !score.criterion || !score.value}>{t.saveScore}</Btn>
            </form>
          )}
          {canEdit && conv.ticket && (
            <form className="ath-toolbar" onSubmit={(e) => void convert(e)} aria-label={t.convertForm(conv.ticket)}>
              <Field label={t.newProject} mono value={conv.project} onChange={(e) => setConv({ ...conv, project: e.target.value })} required />
              <Field label={t.projectName} value={conv.name} onChange={(e) => setConv({ ...conv, name: e.target.value })} required />
              <Field label={t.templateKey} mono value={conv.template} placeholder="spatial-project" onChange={(e) => setConv({ ...conv, template: e.target.value })} />
              <Btn type="submit" size="sm" disabled={!conv.project || !conv.name}>{t.convertSubmit}</Btn>
              <Btn type="button" size="sm" variant="ghost" onClick={() => setConv({ ticket: '', project: '', name: '', template: '' })}>{t.cancel}</Btn>
            </form>
          )}
          {canEdit && (
            <form className="ath-stack" onSubmit={(e) => void saveModel(e)} aria-label={t.modelForm}>
              <label className="ath-field__label" htmlFor="sc-model">{t.modelHelp}</label>
              <Textarea id="sc-model" rows={4} value={model} placeholder="valeur;Valeur;3;0;10;higher" onChange={(e) => setModel(e.target.value)} />
              <div><Btn type="submit" size="sm" disabled={!model.trim()}>{t.saveModel}</Btn></div>
            </form>
          )}
          {ranking.model && (() => {
            // bulles valeur × risque : points de contribution des critères « valeur » et « risque » quand le modèle les porte (clés conventionnelles)
            const pts = chart.filter((r) => r.contributions.some((c) => c.criterion === 'valeur') && r.contributions.some((c) => c.criterion === 'risque'));
            return pts.length > 0 ? (
              <Chart type="scatter" title={t.bubbles} categories={pts.map((r) => r.key)} reference={{ x: 50, y: 50 }}
                series={[{ name: t.valueAxis, data: pts.map((r) => r.contributions.find((c) => c.criterion === 'valeur')!.points) }, { name: t.riskAxis, data: pts.map((r) => r.contributions.find((c) => c.criterion === 'risque')!.points) }]} />
            ) : null;
          })()}
          {ranking.model && ranking.requests.length > 1 && (
            <section aria-label={t.compareTitle}>
              <h3 className="ath-subsection-title">{t.compareTitle}</h3>
              <div className="ath-toolbar" role="group" aria-label={t.comparePick}>
                {ranking.requests.map((r) => (
                  <label key={r.key} className="ath-notify__pref"><Checkbox checked={compare.includes(r.key)} disabled={!compare.includes(r.key) && compare.length >= 5} onChange={(e) => setCompare(e.target.checked ? [...compare, r.key] : compare.filter((k) => k !== r.key))} />{r.key}</label>
                ))}
              </div>
              {compare.length >= 2 && (
                <Table caption={t.compareCaption(compare.length)}>
                  <thead><tr><Th>{t.criterion}</Th>{compare.map((k) => <Th key={k}>{k}</Th>)}</tr></thead>
                  <tbody>
                    {ranking.model.criteria.map((c) => <tr key={c.key}><Td>{c.label}</Td>{compare.map((k) => <Td key={k} mono>{ranking.requests.find((r) => r.key === k)?.contributions.find((x) => x.criterion === c.key)?.points ?? '—'}</Td>)}</tr>)}
                    <tr><Td><strong>{t.score}</strong></Td>{compare.map((k) => <Td key={k} mono>{ranking.requests.find((r) => r.key === k)?.score ?? '—'}</Td>)}</tr>
                  </tbody>
                </Table>
              )}
            </section>
          )}
          {ranking.model && chart.length > 1 && (
            <Chart type="radar" title={t.radar} categories={ranking.model.criteria.map((c) => c.label)}
              series={chart.slice(0, 5).map((r) => ({ name: r.key, data: ranking.model!.criteria.map((c) => r.contributions.find((x) => x.criterion === c.key)?.points ?? 0) }))} />
          )}
          {chart.length > 0 && ranking.model && (
            <Chart type="bar" title={t.contribution} unit={t.points} categories={chart.map((r) => r.key)}
              series={ranking.model.criteria.map((c) => ({ name: c.label, data: chart.map((r) => r.contributions.find((x) => x.criterion === c.key)?.points ?? 0) }))} />
          )}
        </div>
      </Card>
      <Card title={t.scenarios}>
        <div className="ath-stack">
          {scenarios.length === 0 ? <p>{t.noScenario}</p> : (
            <ul>{scenarios.map((s) => <li key={s.id}>{s.name} · {t.changes(s.changeCount)} <Btn size="sm" variant="ghost" onClick={() => void evaluate(s.id)}>{t.evaluate}</Btn></li>)}</ul>
          )}
          {canEdit && (
            <form className="ath-toolbar" onSubmit={(e) => void createScenario(e)} aria-label={t.scenarioForm}>
              <Field label={t.scenarioName} value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} required />
              <Field label={t.slipTicket} mono value={shift.ticket} onChange={(e) => setShift({ ...shift, ticket: e.target.value })} required />
              <Field label={t.slipDays} type="number" value={shift.days} onChange={(e) => setShift({ ...shift, days: e.target.value })} required />
              <Btn type="submit" size="sm" disabled={!shift.name || !shift.ticket}>{t.createScenario}</Btn>
            </form>
          )}
          {evaluation && (
            <section aria-label={t.resultOf(evaluation.scenario.name)}>
              <h3 className="ath-subsection-title">{t.resultOf(evaluation.scenario.name)}</h3>
              {evaluation.result.shifts.map((s) => <p key={s.ticket}>{t.slipResult(s.ticket, s.shiftDays, s.impacts.map((i) => `${i.key} (+${i.shiftDays} j)`).join(', ') || t.nobody)}</p>)}
              {evaluation.result.capacity.map((c) => <p key={c.team}>{t.capacityResult(c.team, c.periods.map((p) => `${p.period} : ${p.beforeLevel} % → ${p.afterLevel} %`).join(' ; '))}</p>)}
              {evaluation.result.budget.map((b) => <p key={b.project}>{t.budgetResult(b.project, euros(b.varianceBefore), euros(b.varianceAfter))}</p>)}
              <p><small>{t.readOnly}</small></p>
            </section>
          )}
        </div>
      </Card>
      {canSeeFinance && ev && ev.length > 0 && (
        <Card title={t.earnedValue}>
          <Table caption={t.evCaption(ev.length)}>
            <thead><tr><Th>{fr.steer.project}</Th><Th>{t.bac}</Th><Th>{t.pv}</Th><Th>{t.ev}</Th><Th>{t.ac}</Th><Th>{t.cpi}</Th><Th>{t.spi}</Th><Th>{t.reading}</Th></tr></thead>
            <tbody>{ev.map((r) => (
              <tr key={r.project}><Td mono><Link className="ath-link" to={`/p/${r.project}`}>{r.project}</Link></Td><Td mono>{euros(r.bac)}</Td><Td mono>{euros(r.pv)}</Td><Td mono>{euros(r.ev)}</Td><Td mono>{euros(r.ac)}</Td>
                <Td mono>{r.cpi ?? '—'}</Td><Td mono>{r.spi ?? '—'}</Td><Td>{t.quadrants[r.quadrant] ?? r.quadrant}</Td></tr>
            ))}</tbody>
          </Table>
          {ev.filter((r) => r.cpi !== null && r.spi !== null).length > 0 && (
            <Chart type="scatter" title={t.quadrantChart} categories={ev.filter((r) => r.cpi !== null && r.spi !== null).map((r) => r.project)}
              series={[{ name: t.cpi, data: ev.filter((r) => r.cpi !== null && r.spi !== null).map((r) => r.cpi as number) }, { name: t.spi, data: ev.filter((r) => r.cpi !== null && r.spi !== null).map((r) => r.spi as number) }]} reference={{ x: 1, y: 1 }} />
          )}
        </Card>
      )}
    </div>
  );
}

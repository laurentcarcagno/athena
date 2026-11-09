import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Btn, EmptyState, PageHeader, Table, Tag, Td, Th, useToast } from '@athena/ui';
import { api, type Session } from '../../api';
import { useFailure } from '../../hooks';
import { fr } from '../../i18n';

type Applicability = 'applicable' | 'not_applicable' | 'modified';
interface Row { key: string; reference: string; title: string; standard: string; applicability: Applicability; justification: string; evidence: Array<{ key: string; title: string; tracker: string }>; covered: boolean }
interface Matrix { category: string | null; categories: string[]; totals: { clauses: number; applicable: number; notApplicable: number; modified: number; covered: number; rate: number | null }; rows: Row[] }
interface ImportLine { line: number; reference: string; status: 'created' | 'updated' | 'unchanged' | 'error'; key?: string; message?: string }
interface ImportReport { created: number; updated: number; unchanged: number; errors: number; lines: ImportLine[] }

/** Onglet Conformité : taux de clauses applicables couvertes par une preuve, tailoring par clause et catégorie, import et export CSV. */
export function ConformityTab({ session }: { session: Session }) {
  const { project } = useParams();
  const fail = useFailure();
  const toast = useToast();
  const t = fr.conformity;
  const roles = session.user?.roles ?? [];
  const canEdit = roles.includes('athena-admin') || roles.includes('athena-pm');
  const [category, setCategory] = useState<string | null>(null);
  const [data, setData] = useState<Matrix | null>(null);
  const [tailoring, setTailoring] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const load = useCallback(() => {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    api<Matrix>('GET', `/v1/projects/${project}/conformity${q}`).then((m) => { setData(m); setCategory((c) => c ?? m.category); }).catch(fail);
  }, [project, category, fail]);
  useEffect(load, [load]);

  const exportCsv = async () => {
    try {
      const q = category ? `?category=${encodeURIComponent(category)}` : '';
      const out = await api<{ filename: string; csv: string }>('GET', `/v1/projects/${project}/conformity/export${q}`);
      const href = URL.createObjectURL(new Blob([out.csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = href; a.download = out.filename; a.click();
      URL.revokeObjectURL(href);
    } catch (error) { fail(error); }
  };

  return (
    <>
      <PageHeader eyebrow={fr.overview.eyebrow} title={`${t.title} · ${project}`}
        actions={<><Btn variant="ghost" onClick={() => void exportCsv()}>{t.exportCsv}</Btn>{canEdit && <Btn icon="check" onClick={() => { setImporting(true); setReport(null); }}>{t.importClauses}</Btn>}</>} />
      {importing && <ImportForm project={String(project)} report={report} onReport={(r) => { setReport(r); toast('success', t.imported(r.created, r.updated, r.unchanged, r.errors)); load(); }} onClose={() => setImporting(false)} />}
      {data === null ? <p role="status">{fr.loading}</p> : data.totals.clauses === 0 ? <EmptyState eyebrow={t.title} title={t.empty} /> : (
        <>
          <section className="ath-card ath-stack" aria-label={t.title}>
            <p><span className="ath-mono">{data.totals.rate === null ? '—' : `${data.totals.rate} %`}</span> {t.rate(data.totals.rate)}</p>
            <p className="ath-eyebrow">{t.counts(data.totals.applicable, data.totals.covered, data.totals.notApplicable, data.totals.modified)}</p>
            {data.categories.length > 0 && (
              <div className="ath-field">
                <label className="ath-field__label" htmlFor="cf-category">{t.category}</label>
                <select id="cf-category" className="ath-select" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
                  {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </section>
          {tailoring && <TailoringForm key={tailoring.reference} project={String(project)} row={tailoring} categories={data.categories} current={category}
            onCancel={() => setTailoring(null)} onSaved={() => { toast('success', t.saved); setTailoring(null); load(); }} />}
          <Table>
            <caption className="ath-table__caption">{t.title} · {project}{category ? ` · ${category}` : ''}</caption>
            <thead><tr><Th>{t.reference}</Th><Th>{t.clauseTitle}</Th><Th>{t.applicability}</Th><Th>{t.evidence}</Th><Th>{t.covered}</Th>{canEdit && <Th>{t.tailor}</Th>}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key}>
                  <Td mono><Link className="ath-link" to={`/p/${project}/a/${r.key}`}>{r.reference}</Link></Td>
                  <Td>{r.title}{r.justification && <><br /><span className="ath-eyebrow">{r.justification}</span></>}</Td>
                  <Td><Tag variant={r.applicability === 'applicable' ? 'default' : r.applicability === 'modified' ? 'accent' : 'ghost'}>{t.applicabilities[r.applicability]}</Tag></Td>
                  <Td>{r.evidence.length === 0 ? (r.applicability === 'not_applicable' ? t.notRequired : t.noEvidence) : <ul>{r.evidence.map((e) => <li key={e.key}><Link className="ath-link ath-mono" to={`/p/${project}/a/${e.key}`} title={e.title}>{e.key}</Link></li>)}</ul>}</Td>
                  <Td>{r.applicability === 'not_applicable' ? t.notRequired : r.covered ? t.yes : t.no}</Td>
                  {canEdit && <Td><Btn variant="ghost" size="sm" aria-label={t.tailorFor(r.reference)} onClick={() => setTailoring(r)}>{t.tailor}</Btn></Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}

function TailoringForm({ project, row, categories, current, onCancel, onSaved }: { project: string; row: Row; categories: string[]; current: string | null; onCancel: () => void; onSaved: () => void }) {
  const fail = useFailure();
  const t = fr.conformity;
  const [applicability, setApplicability] = useState<Applicability>(row.applicability);
  const [scope, setScope] = useState<string>(current ?? '*');
  const [justification, setJustification] = useState(row.justification);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (applicability !== 'applicable' && justification.trim() === '') { setError(t.justificationRequired); return; }
    setError(null);
    try { await api('PUT', `/v1/projects/${project}/tailoring`, { clause: row.reference, category: scope, applicability, justification }); onSaved(); } catch (e) { fail(e); }
  };
  return (
    <form className="ath-card ath-stack" onSubmit={(e) => void submit(e)} aria-label={t.tailorFor(row.reference)}>
      <h2 className="ath-card__title">{t.tailorFor(row.reference)}</h2>
      <div className="ath-toolbar">
        <div className="ath-field"><label className="ath-field__label" htmlFor="tl-app">{t.applicability}</label>
          <select id="tl-app" className="ath-select" value={applicability} onChange={(e) => setApplicability(e.target.value as Applicability)}>
            {(['applicable', 'not_applicable', 'modified'] as const).map((a) => <option key={a} value={a}>{t.applicabilities[a]}</option>)}
          </select></div>
        <div className="ath-field"><label className="ath-field__label" htmlFor="tl-scope">{t.scope}</label>
          <select id="tl-scope" className="ath-select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="*">{t.allScope}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
      </div>
      <div className="ath-field"><label className="ath-field__label" htmlFor="tl-just">{t.justification}</label>
        <textarea id="tl-just" className="ath-input" rows={3} maxLength={2000} aria-invalid={error ? true : undefined} aria-describedby={error ? 'tl-err' : undefined} value={justification} onChange={(e) => setJustification(e.target.value)} />
        {error && <p id="tl-err" role="alert">{error}</p>}</div>
      <div className="ath-toolbar"><Btn icon="save" type="submit">{t.save}</Btn><Btn icon="close" type="button" variant="ghost" onClick={onCancel}>{fr.confirm.cancel}</Btn></div>
    </form>
  );
}

function ImportForm({ project, report, onReport, onClose }: { project: string; report: ImportReport | null; onReport: (r: ImportReport) => void; onClose: () => void }) {
  const fail = useFailure();
  const t = fr.conformity;
  const [file, setFile] = useState<File | null>(null);
  const [standard, setStandard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) { setError(t.noFile); return; }
    setError(null);
    try { onReport(await api<ImportReport>('POST', `/v1/projects/${project}/clauses/import`, { csv: await file.text(), ...(standard.trim() ? { standard: standard.trim() } : {}) })); } catch (e) { fail(e); }
  };
  return (
    <form className="ath-card ath-stack" onSubmit={(e) => void submit(e)} aria-label={t.importTitle}>
      <h2 className="ath-card__title">{t.importTitle}</h2>
      <div className="ath-toolbar">
        <div className="ath-field"><label className="ath-field__label" htmlFor="im-file">{t.file}</label>
          <input id="im-file" className="ath-input" type="file" accept=".csv,text/csv" aria-describedby={error ? 'im-err' : undefined} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {error && <p id="im-err" role="alert">{error}</p>}</div>
        <div className="ath-field"><label className="ath-field__label" htmlFor="im-std">{t.standard}</label>
          <input id="im-std" className="ath-input ath-mono" maxLength={200} value={standard} onChange={(e) => setStandard(e.target.value)} /></div>
      </div>
      <div className="ath-toolbar"><Btn icon="check" type="submit">{t.run}</Btn><Btn icon="close" type="button" variant="ghost" onClick={onClose}>{fr.confirm.cancel}</Btn></div>
      {report && (
        <Table>
          <caption className="ath-table__caption">{t.imported(report.created, report.updated, report.unchanged, report.errors)}</caption>
          <thead><tr><Th>{t.line}</Th><Th>{t.reference}</Th><Th>{t.status}</Th><Th>{t.message}</Th></tr></thead>
          <tbody>{report.lines.map((l) => <tr key={`${l.line}-${l.reference}`}><Td mono>{l.line}</Td><Td mono>{l.reference}</Td><Td>{t.statuses[l.status]}</Td><Td mono>{l.key ?? l.message ?? ''}</Td></tr>)}</tbody>
        </Table>
      )}
    </form>
  );
}

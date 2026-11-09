import { Btn, Table, Tag, Td, Th } from '@athena/ui';
import { fr } from '../i18n';

export interface TrackerUpgrade {
  key: string; name: string; action: 'create' | 'update' | 'unchanged'; items: number;
  fieldsAdded: Array<{ key: string; label: string; type: string; required: boolean }>;
  fieldsRelabeled: Array<{ key: string; from: string; to: string }>;
  fieldsKept: string[];
  statusesAdded: Array<{ key: string; name: string }>;
  statusesRenamed: Array<{ key: string; from: string; to: string }>;
  statusesRemoved: Array<{ key: string; name: string; items: number }>;
  transitionsAdded: string[];
}
export interface UpgradeReportData {
  project: string; template: string; from: string | null; to: string;
  trackers: TrackerUpgrade[];
  rules: { added: string[]; updated: string[]; keptLocal: string[]; retired: string[] };
  phases: { added: string[]; removed: string[]; current: string | null; nextCurrent: string | null };
  blockers: string[]; warnings: string[]; itemsConcerned: number;
}

const list = (xs: string[]) => xs.join(', ');

/** Lignes de détail d'un tracker : un changement par ligne, les identifiants en police à chasse fixe. */
function Changes({ u }: { u: TrackerUpgrade }) {
  const t = fr.upgrade;
  const lines: string[] = [];
  if (u.fieldsAdded.length) lines.push(t.fieldsAdded(list(u.fieldsAdded.map((f) => f.key))));
  if (u.fieldsRelabeled.length) lines.push(t.fieldsRelabeled(list(u.fieldsRelabeled.map((f) => `${f.key} (${f.from} → ${f.to})`))));
  if (u.fieldsKept.length) lines.push(t.fieldsKept(list(u.fieldsKept)));
  if (u.statusesAdded.length) lines.push(t.statusesAdded(list(u.statusesAdded.map((s) => s.key))));
  if (u.statusesRenamed.length) lines.push(t.statusesRenamed(list(u.statusesRenamed.map((s) => `${s.key} (${s.from} → ${s.to})`))));
  if (u.statusesRemoved.length) lines.push(t.statusesRemoved(list(u.statusesRemoved.map((s) => `${s.key} (${s.items})`))));
  if (u.transitionsAdded.length) lines.push(t.transitionsAdded(list(u.transitionsAdded)));
  return <ul className="ath-stack">{lines.map((l) => <li key={l} className="ath-mono">{l}</li>)}</ul>;
}

/**
 * Rapport d'impact d'une montée de version (champs ajoutés, états modifiés, items concernés) : affiché avant toute
 * application. Les blocages sont annoncés en texte et désactivent l'application.
 */
export function UpgradeReport({ report, busy = false, onApply, onCancel }: { report: UpgradeReportData; busy?: boolean; onApply?: () => void; onCancel?: () => void }) {
  const t = fr.upgrade;
  const changed = report.trackers.filter((x) => x.action !== 'unchanged');
  const { rules, phases } = report;
  const ruleLines = [
    rules.added.length ? t.rulesAdded(list(rules.added)) : '', rules.updated.length ? t.rulesUpdated(list(rules.updated)) : '',
    rules.keptLocal.length ? t.rulesKept(list(rules.keptLocal)) : '', rules.retired.length ? t.rulesRetired(list(rules.retired)) : '',
  ].filter(Boolean);
  const phaseLines = [
    phases.added.length ? t.phasesAdded(list(phases.added)) : '', phases.removed.length ? t.phasesRemoved(list(phases.removed)) : '',
    phases.nextCurrent !== phases.current && phases.nextCurrent ? t.phaseNext(phases.nextCurrent) : '',
  ].filter(Boolean);
  return (
    <section className="ath-card ath-stack" aria-labelledby="upgrade-title">
      <h2 id="upgrade-title" className="ath-card__title">{t.title(report.from ?? '—', report.to)}</h2>
      <p>{t.summary(changed.length, report.itemsConcerned)}</p>
      {report.blockers.length > 0 && (
        <div role="alert" className="ath-stack">
          <h3 className="ath-eyebrow">{t.blockers}</h3>
          <ul>{report.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {report.warnings.length > 0 && (
        <div className="ath-stack">
          <h3 className="ath-eyebrow">{t.warnings}</h3>
          <ul>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {changed.length === 0 ? <p>{t.nothing}</p> : (
        <Table>
          <caption className="ath-table__caption">{t.title(report.from ?? '—', report.to)}</caption>
          <thead><tr><Th>{t.tracker}</Th><Th>{t.action}</Th><Th>{t.details}</Th><Th>{t.itemsCol}</Th></tr></thead>
          <tbody>
            {changed.map((u) => (
              <tr key={u.key}>
                <Td mono>{u.key}</Td>
                <Td><Tag variant={u.action === 'create' ? 'accent' : 'default'}>{t.actions[u.action]}</Tag></Td>
                <Td><Changes u={u} /></Td>
                <Td mono>{u.items}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {ruleLines.length > 0 && <div><h3 className="ath-eyebrow">{t.rules}</h3><ul>{ruleLines.map((l) => <li key={l} className="ath-mono">{l}</li>)}</ul></div>}
      {phaseLines.length > 0 && <div><h3 className="ath-eyebrow">{t.phases}</h3><ul>{phaseLines.map((l) => <li key={l} className="ath-mono">{l}</li>)}</ul></div>}
      {(onApply || onCancel) && (
        <div className="ath-row">
          {onApply && <Btn disabled={busy || report.blockers.length > 0} loading={busy} onClick={onApply}>{busy ? t.applying : t.apply}</Btn>}
          {onCancel && <Btn icon="close" variant="ghost" onClick={onCancel}>{t.cancel}</Btn>}
        </div>
      )}
    </section>
  );
}

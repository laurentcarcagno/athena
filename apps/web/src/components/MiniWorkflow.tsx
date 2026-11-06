import { StatusPill } from '@athena/ui';
import { fr } from '../i18n';
import { pillKind } from './ArtifactTable';

export interface WorkflowState { key: string; name: string; category: string; count: number }

/** Mini-schéma du workflow : les états dans l'ordre, avec leur compteur ; un clic filtre sur l'état (ou le retire). */
export function MiniWorkflow({ states, active, onPick }: { states: WorkflowState[]; active: string | null; onPick: (key: string | null) => void }) {
  return (
    <ol className="ath-miniworkflow" aria-label={fr.trackerScreen.workflow}>
      {states.map((s, i) => (
        <li key={s.key} className="ath-miniworkflow__state">
          {i > 0 && <span aria-hidden="true" className="ath-miniworkflow__arrow">→</span>}
          <button type="button" className="ath-miniworkflow__btn" aria-pressed={active === s.key} onClick={() => onPick(active === s.key ? null : s.key)}>
            <StatusPill kind={pillKind(s.category)}>{s.name}</StatusPill> <span className="ath-mono">{s.count}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

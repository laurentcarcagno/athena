/** Graphiques des versions : barre d'avancement et Gantt à plat (tableau de bord, Roadmap T-0117). */

export interface ReleaseSpan { id: string; name: string; startsOn: string; endsOn: string; progress: number }

/** Barre horizontale à plat en SVG (attributs de présentation : compatibles avec une CSP sans styles en ligne). */
export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <svg className="ath-bar" role="img" aria-label={`${label} : ${value}`} width="100%" height="10" preserveAspectRatio="none" data-percent={percent}>
      <rect className="ath-bar__track" x="0" y="0" width="100%" height="10" />
      <rect className="ath-bar__fill" x="0" y="0" width={`${percent}%`} height="10" />
    </svg>
  );
}

const DAY = 86_400_000;

/** Calcule la position (en %) de chaque version sur l'axe du temps commun. */
export function ganttLayout(releases: ReleaseSpan[]): Array<{ id: string; left: number; width: number; progress: number }> {
  const spans = releases.map((r) => ({ r, start: Date.parse(r.startsOn), end: Date.parse(r.endsOn) })).filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
  if (spans.length === 0) return [];
  const min = Math.min(...spans.map((s) => s.start));
  const max = Math.max(...spans.map((s) => s.end + DAY));
  const total = max - min;
  return spans.map(({ r, start, end }) => ({
    id: r.id, left: ((start - min) / total) * 100, width: Math.max(((end + DAY - start) / total) * 100, 1), progress: r.progress,
  }));
}

/** Diagramme de Gantt à plat des versions (SVG, aucun style en ligne). */
export function Gantt({ releases, label = 'Gantt' }: { releases: ReleaseSpan[]; label?: string }) {
  const rows = ganttLayout(releases);
  const ROW = 22;
  const name = (id: string) => releases.find((r) => r.id === id)!;
  return (
    <svg className="ath-gantt" role="img" aria-label={label} width="100%" height={rows.length * ROW + 4} preserveAspectRatio="none">
      {rows.map((row, i) => {
        const r = name(row.id);
        return (
          <g key={row.id}>
            <title>{`${r.name} : ${r.startsOn} → ${r.endsOn} (${Math.round(row.progress * 100)} %)`}</title>
            <rect className="ath-gantt__track" x={`${row.left}%`} y={i * ROW + 2} width={`${row.width}%`} height={ROW - 6} />
            <rect className="ath-gantt__fill" x={`${row.left}%`} y={i * ROW + 2} width={`${row.width * row.progress}%`} height={ROW - 6} />
          </g>
        );
      })}
    </svg>
  );
}

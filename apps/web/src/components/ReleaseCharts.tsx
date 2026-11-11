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

const MONTH = (d: Date, locale: string) => d.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const SHORT = (iso: string, locale: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Frise des versions (ADR-0005, T-0150) : axe des mois, une barre nommée par version (dates, tickets terminés) et repère
 * « aujourd'hui ». SVG à positions en pourcentage : aucune mise en forme en ligne (CSP).
 */
export function Timeline({ releases, label, today = new Date(), locale = 'fr', todayLabel = 'aujourd’hui', counts = {} }: {
  releases: ReleaseSpan[]; label: string; today?: Date; locale?: string; todayLabel?: string; counts?: Record<string, string>;
}) {
  const spans = releases.map((r) => ({ r, start: Date.parse(`${r.startsOn}T00:00:00Z`), end: Date.parse(`${r.endsOn}T00:00:00Z`) + DAY }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (spans.length === 0) return null;
  const first = new Date(Math.min(...spans.map((s) => s.start)));
  const last = new Date(Math.max(...spans.map((s) => s.end)));
  const min = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const max = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
  const pct = (t: number) => ((t - min) / (max - min)) * 100;
  const months: number[] = [];
  for (let m = new Date(min); m.getTime() < max; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(m.getTime());
  const ROW = 34, AXIS = 22;
  const now = today.getTime();
  const height = AXIS + spans.length * ROW + 6;
  return (
    <svg className="ath-timeline" role="img" aria-label={label} width="100%" height={height}>
      {months.map((m) => (
        <g key={m}>
          <line className="ath-timeline__grid" x1={`${pct(m)}%`} x2={`${pct(m)}%`} y1="0" y2={height} />
          <text className="ath-timeline__month" x={`${pct(m) + 0.5}%`} y="14">{MONTH(new Date(m), locale)}</text>
        </g>
      ))}
      {spans.map(({ r, start, end }, i) => {
        const y = AXIS + i * ROW + 4;
        return (
          <g key={r.id}>
            <title>{`${r.name} : ${SHORT(r.startsOn, locale)} → ${SHORT(r.endsOn, locale)} (${Math.round(r.progress * 100)} %)`}</title>
            <rect className="ath-timeline__bar" x={`${pct(start)}%`} y={y} width={`${pct(end) - pct(start)}%`} height={ROW - 10} />
            <rect className="ath-timeline__done" x={`${pct(start)}%`} y={y + ROW - 14} width={`${(pct(end) - pct(start)) * r.progress}%`} height="4" />
            <text className="ath-timeline__label" x={`${pct(start) + 0.6}%`} y={y + 15}>
              <tspan className="ath-timeline__name">{r.name}</tspan>
              <tspan className="ath-timeline__dates">{`  ${SHORT(r.startsOn, locale)} → ${SHORT(r.endsOn, locale)}${counts[r.id] ? ` · ${counts[r.id]}` : ''}`}</tspan>
            </text>
          </g>
        );
      })}
      {now >= min && now <= max && (
        <g>
          <line className="ath-timeline__today" x1={`${pct(now)}%`} x2={`${pct(now)}%`} y1="0" y2={height} />
          <text className="ath-timeline__today-label" x={`${pct(now) + 0.5}%`} y={height - 2}>{todayLabel}</text>
        </g>
      )}
    </svg>
  );
}

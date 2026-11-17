import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { buildChartOption, readChartTokens, type ChartInput } from './chart-option.js';

export interface ChartProps extends ChartInput {
  /** Lien de l'objet source d'une catégorie (clic sur le graphique, lien dans la vue tableau). */
  hrefFor?: (category: string, index: number) => string | undefined;
  /** Rendu d'un lien (routeur de l'application) ; par défaut un `<a href>`. */
  renderLink?: (href: string, children: ReactNode) => ReactNode;
  /** Appelé au clic sur une catégorie ; sans lui, le clic ouvre `hrefFor`. */
  onSelect?: (category: string, index: number) => void;
  height?: number;
  labels?: { chart: string; table: string; category: string };
}

const DEFAULT_LABELS = { chart: 'Graphique', table: 'Tableau', category: 'Catégorie' };

/** Graphique accessible : rendu SVG chargé à la demande, thème lu sur les jetons, motifs, vue tableau équivalente. */
export function Chart({ hrefFor, renderLink, onSelect, height = 260, labels = DEFAULT_LABELS, ...input }: ChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const id = useId();
  const latest = useRef({ hrefFor, onSelect, input });
  latest.current = { hrefFor, onSelect, input };
  const inputKey = JSON.stringify(input);

  useEffect(() => {
    if (view !== 'chart' || !host.current) return;
    const el = host.current;
    let disposed = false;
    let dispose = () => {};
    import('./chart-echarts.js').then(({ echarts }) => {
      if (disposed) return;
      const chart = echarts.init(el, null, { renderer: 'svg', height });
      const draw = () => chart.setOption(buildChartOption(latest.current.input, readChartTokens(el)), true);
      draw();
      chart.on('click', (p: { dataIndex?: number }) => {
        const i = p.dataIndex ?? -1;
        const cat = latest.current.input.categories[i];
        if (cat === undefined) return;
        if (latest.current.onSelect) { latest.current.onSelect(cat, i); return; }
        const href = latest.current.hrefFor?.(cat, i);
        if (href) window.location.assign(href);
      });
      const resize = new ResizeObserver(() => chart.resize());
      resize.observe(el);
      // Changement de thème ou de mode : les couleurs sont relues sur les jetons.
      const themed = new MutationObserver(draw);
      themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'data-density'] });
      dispose = () => { resize.disconnect(); themed.disconnect(); chart.dispose(); };
    }).catch(() => { if (!disposed) { setFailed(true); setView('table'); } });
    return () => { disposed = true; dispose(); };
  }, [view, inputKey, height]);

  const link = (href: string, children: ReactNode) => (renderLink ? renderLink(href, children) : <a href={href}>{children}</a>);
  return (
    <figure className="ath-chart">
      <figcaption className="ath-chart__head">
        <span className="ath-chart__title">{input.title}</span>
        {!failed && (
          <span className="ath-chart__switch" role="group" aria-label={input.title}>
            {(['chart', 'table'] as const).map((v) => (
              <button key={v} type="button" className="ath-chart__tab" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'chart' ? labels.chart : labels.table}
              </button>
            ))}
          </span>
        )}
      </figcaption>
      {view === 'chart'
        ? <div id={`${id}-chart`} ref={host} className="ath-chart__canvas" role="img" aria-label={input.title} />
        : (
          <div id={`${id}-table`} className="ath-table-wrap">
            <table className="ath-table">
              <thead><tr><th scope="col" className="ath-th">{labels.category}</th>{input.series.map((s) => <th key={s.name} scope="col" className="ath-th">{s.name}</th>)}</tr></thead>
              <tbody>
                {input.categories.map((c, i) => {
                  const href = hrefFor?.(c, i);
                  return <tr key={`${c}-${i}`}><th scope="row">{href ? link(href, c) : c}</th>{input.series.map((s) => <td key={s.name}>{s.data[i]}{input.unit ? ` ${input.unit}` : ''}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
    </figure>
  );
}
